'use client'

/**
 * Painel de diagnostico.
 *
 * Ferramenta interna. Corre as medicoes no browser que a esta a abrir, e
 * imprime um relatorio em JSON no fim para poder ser colado num documento.
 *
 * Existe porque nem Firefox nem WebKit podem ser instalados no ambiente onde
 * este projeto e desenvolvido, e porque nenhum teste automatizado substitui
 * abrir a aplicacao num iPhone real.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/controls/Button'
import { formatoPorId, type FormatId } from '@/config/formats'
import { MAGICK_WASM_VERSION } from '@/config/engine'
import { LIMITES } from '@/config/limits'
import {
  lerAmbiente,
  lerMemoria,
  sondarCapacidades,
  type InfoDoAmbiente,
  type ResultadoCapacidade,
} from '@/lib/dev/capacidades'
import { gerarFicheiroDeTeste } from '@/lib/dev/gerarPng'
import { formatarBytes } from '@/lib/format/bytes'
import { EngineClient } from '@/lib/image-engine/client/EngineClient'
import type { EngineCapabilities } from '@/lib/image-engine/ImageEngine'
import {
  correrEscadaDeMemoria,
  correrOtimizacaoNoMesmoFormato,
  correrVarreduraDeQualidade,
  mensagem,
  type DegrauDeMemoria,
  type PontoDeQualidade,
  type ResultadoOtimizacao,
} from './medicoes'
import styles from './PainelDeDiagnostico.module.css'

type Estado = 'inativo' | 'a-correr' | 'concluido' | 'falhou'

export function PainelDeDiagnostico() {
  const [ambiente, setAmbiente] = useState<InfoDoAmbiente | null>(null)
  const [capacidades, setCapacidades] = useState<readonly ResultadoCapacidade[]>([])
  const [estado, setEstado] = useState<Estado>('inativo')
  const [passo, setPasso] = useState('')
  const [motor, setMotor] = useState<EngineCapabilities | null>(null)
  const [arranqueMs, setArranqueMs] = useState<number | null>(null)
  const [escada, setEscada] = useState<readonly DegrauDeMemoria[]>([])
  const [qualidade, setQualidade] = useState<readonly PontoDeQualidade[]>([])
  const [otimizacao, setOtimizacao] = useState<readonly ResultadoOtimizacao[]>([])
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const clienteRef = useRef<EngineClient | null>(null)

  // Sondar so depois de montar: no servidor nao existe navigator nem CSS.
  useEffect(() => {
    setAmbiente(lerAmbiente())
    setCapacidades(sondarCapacidades())
    return () => {
      clienteRef.current?.dispose()
      clienteRef.current = null
    }
  }, [])

  const correr = useCallback(async () => {
    setEstado('a-correr')
    setErroGeral(null)
    const cliente = new EngineClient()
    clienteRef.current = cliente

    try {
      setPasso('A preparar o motor...')
      const inicio = performance.now()
      const capacidadesDoMotor = await cliente.prepare()
      setArranqueMs(Math.round(performance.now() - inicio))
      setMotor(capacidadesDoMotor)

      setPasso('A gerar a imagem de referencia...')
      const referencia = await gerarFicheiroDeTeste(1600, 1200)

      setPasso('Otimizacao no mesmo formato...')
      const amostras: { formato: FormatId; ficheiro: File }[] = []
      for (const formato of ['jpeg', 'png', 'webp'] as const) {
        const convertido = await cliente.convert(referencia, {
          outputFormat: formato,
          quality: formatoPorId(formato).defaultQuality,
          preset: null,
          metadata: 'preservar-cor',
          autoOrient: true,
          lossless: false,
          resize: null,
          palette: null,
          chroma: '4:2:0',
          // O diagnostico mede compressao, nao recorte.
          background: null,
        })
        amostras.push({
          formato,
          ficheiro: new File([convertido.blob], `ref.${formatoPorId(formato).extensions[0]}`, {
            type: formatoPorId(formato).mimeTypes[0],
          }),
        })
      }
      setOtimizacao(await correrOtimizacaoNoMesmoFormato(cliente, amostras, setPasso))

      setPasso('Varredura de qualidade...')
      setQualidade(await correrVarreduraDeQualidade(cliente, referencia, ['jpeg', 'webp'], setPasso))

      setPasso('Escada de memoria...')
      setEscada(await correrEscadaDeMemoria(cliente, 'webp', setPasso))

      setPasso('')
      setEstado('concluido')
    } catch (erro) {
      setErroGeral(mensagem(erro))
      setEstado('falhou')
    }
  }, [])

  const relatorio = {
    versaoDoMotorWasm: MAGICK_WASM_VERSION,
    ambiente,
    motor,
    arranqueMs,
    memoriaNoFim: lerMemoria(),
    capacidades: capacidades.map((c) => ({
      nome: c.nome,
      suportada: c.suportada,
      criticidade: c.criticidade,
    })),
    limitesConfigurados: LIMITES,
    otimizacaoNoMesmoFormato: otimizacao,
    varreduraDeQualidade: qualidade,
    escadaDeMemoria: escada,
  }

  const obrigatoriasEmFalta = capacidades.filter((c) => c.criticidade === 'obrigatoria' && !c.suportada)
  const maiorDegrauOk = [...escada].reverse().find((d) => d.resultado === 'ok')
  const primeiraFalha = escada.find((d) => d.resultado === 'falhou')

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Diagnostico do motor</h1>
          <p className={styles.subtitulo}>
            Ferramenta interna de validacao. Nao faz parte do produto e nao envia nada para
            servidor nenhum.
          </p>
        </div>
        <Button variante="primario" onClick={() => void correr()} disabled={estado === 'a-correr'}>
          {estado === 'a-correr' ? 'A correr...' : 'Correr medicoes'}
        </Button>
      </header>

      {estado === 'a-correr' ? <p className={styles.passo}>{passo}</p> : null}
      {erroGeral ? <p className={styles.erro}>Falhou: {erroGeral}</p> : null}

      {/* ------------------------------------------------------------ ambiente */}
      <Secao titulo="Ambiente">
        {ambiente ? (
          <dl className={styles.definicoes}>
            <Par etiqueta="User agent" valor={ambiente.userAgent} quebrar />
            <Par etiqueta="Plataforma" valor={ambiente.plataforma} />
            <Par etiqueta="Nucleos" valor={ambiente.nucleos === null ? 'nao exposto' : String(ambiente.nucleos)} />
            <Par
              etiqueta="Memoria do dispositivo"
              valor={ambiente.memoriaDispositivoGb === null ? 'nao exposta' : `${ambiente.memoriaDispositivoGb} GB`}
            />
            <Par etiqueta="Viewport" valor={`${ambiente.viewport} @ ${ambiente.dpr}x`} />
            <Par etiqueta="Pontos de toque" valor={String(ambiente.toqueMaximo)} />
          </dl>
        ) : (
          <p className={styles.nota}>A ler...</p>
        )}
      </Secao>

      {/* -------------------------------------------------------- capacidades */}
      <Secao titulo="Capacidades do browser">
        {obrigatoriasEmFalta.length > 0 ? (
          <p className={styles.erro}>
            {obrigatoriasEmFalta.length} capacidade(s) obrigatoria(s) em falta. A aplicacao nao
            funciona neste browser.
          </p>
        ) : capacidades.length > 0 ? (
          <p className={styles.ok}>Todas as capacidades obrigatorias estao presentes.</p>
        ) : null}

        <div className={styles.tabelaEnvolvente}>
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th>Capacidade</th>
                <th>Estado</th>
                <th>Criticidade</th>
                <th>Impacto se faltar</th>
              </tr>
            </thead>
            <tbody>
              {capacidades.map((c) => (
                <tr key={c.nome}>
                  <td>{c.nome}</td>
                  <td className={c.suportada ? styles.celulaOk : styles.celulaFalha}>
                    {c.suportada ? 'sim' : 'nao'}
                  </td>
                  <td>{c.criticidade}</td>
                  <td className={styles.celulaTexto}>{c.impacto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* -------------------------------------------------------------- motor */}
      {motor ? (
        <Secao titulo="Motor">
          <dl className={styles.definicoes}>
            <Par etiqueta="Versao" valor={motor.engineVersion} quebrar />
            <Par etiqueta="Delegates" valor={motor.delegates.join(' ')} quebrar />
            <Par etiqueta="Bits por canal" valor={String(motor.channelDepth)} />
            <Par etiqueta="Arranque" valor={arranqueMs === null ? '-' : `${arranqueMs} ms`} />
          </dl>
        </Secao>
      ) : null}

      {/* ------------------------------------------------------- otimizacao */}
      {otimizacao.length > 0 ? (
        <Secao titulo="Otimizacao no mesmo formato">
          <div className={styles.tabelaEnvolvente}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Formato</th>
                  <th>Original</th>
                  <th>Depois</th>
                  <th>Variacao</th>
                  <th>Tempo</th>
                  <th>Perfis mantidos</th>
                </tr>
              </thead>
              <tbody>
                {otimizacao.map((o) => (
                  <tr key={o.formato}>
                    <td>{formatoPorId(o.formato).label}</td>
                    <td className="numerico">{formatarBytes(o.bytesOrigem)}</td>
                    <td className="numerico">{o.erro ? '-' : formatarBytes(o.bytesSaida)}</td>
                    <td
                      className={`numerico ${o.variacaoPercent > 0 ? styles.celulaFalha : styles.celulaOk}`}
                    >
                      {o.erro ? '-' : `${o.variacaoPercent > 0 ? '+' : ''}${o.variacaoPercent} %`}
                    </td>
                    <td className="numerico">{o.erro ? '-' : `${o.totalMs} ms`}</td>
                    <td>{o.erro ?? (o.perfisMantidos.join(', ') || 'nenhum')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.nota}>
            Um valor positivo na variacao significa que o ficheiro cresceu. Isso e um resultado
            valido e nao um erro: reencodificar um formato com perda pode aumentar o tamanho.
          </p>
        </Secao>
      ) : null}

      {/* --------------------------------------------------------- qualidade */}
      {qualidade.length > 0 ? (
        <Secao titulo="Varredura de qualidade">
          <div className={styles.tabelaEnvolvente}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Qualidade</th>
                  <th>Tamanho</th>
                  <th>Reducao</th>
                  <th>Decode</th>
                  <th>Encode</th>
                </tr>
              </thead>
              <tbody>
                {qualidade.map((q) => (
                  <tr key={`${q.destino}-${q.qualidade}`}>
                    <td>{formatoPorId(q.destino).label}</td>
                    <td className="numerico">{q.qualidade}</td>
                    <td className="numerico">{formatarBytes(q.bytesSaida)}</td>
                    <td className="numerico">{q.reducaoPercent} %</td>
                    <td className="numerico">{q.decodeMs} ms</td>
                    <td className="numerico">{q.encodeMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      {/* ------------------------------------------------------------ escada */}
      {escada.length > 0 ? (
        <Secao titulo="Escada de memoria">
          <p className={styles.nota}>
            Nenhum browser expoe a memoria linear do WebAssembly a JavaScript, portanto o sinal
            util nao e um numero de bytes: e a dimensao a partir da qual a conversao deixa de
            funcionar. A escada para no primeiro degrau que falha.
          </p>
          <div className={styles.tabelaEnvolvente}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Degrau</th>
                  <th>Dimensoes</th>
                  <th>MP</th>
                  <th>Origem</th>
                  <th>Decode</th>
                  <th>Encode</th>
                  <th>Total</th>
                  <th>Saida</th>
                  <th>Heap JS</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {escada.map((d) => (
                  <tr key={d.etiqueta}>
                    <td>{d.etiqueta}</td>
                    <td className="numerico">
                      {d.largura}x{d.altura}
                    </td>
                    <td className="numerico">{d.megapixels}</td>
                    <td className="numerico">{d.bytesOrigem ? formatarBytes(d.bytesOrigem) : '-'}</td>
                    <td className="numerico">{d.decodeMs === null ? '-' : `${d.decodeMs} ms`}</td>
                    <td className="numerico">{d.encodeMs === null ? '-' : `${d.encodeMs} ms`}</td>
                    <td className="numerico">{d.totalMs === null ? '-' : `${d.totalMs} ms`}</td>
                    <td className="numerico">{d.bytesSaida === null ? '-' : formatarBytes(d.bytesSaida)}</td>
                    <td className="numerico">
                      {d.memoriaDepois === null ? 'nao exposto' : `${d.memoriaDepois.usadoMb} MB`}
                    </td>
                    <td
                      className={
                        d.resultado === 'ok'
                          ? styles.celulaOk
                          : d.resultado === 'falhou'
                            ? styles.celulaFalha
                            : ''
                      }
                    >
                      {d.resultado === 'nao-tentado' ? 'nao tentado' : d.resultado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {maiorDegrauOk ? (
            <p className={styles.ok}>
              Maior imagem convertida com sucesso: {maiorDegrauOk.megapixels} MP em{' '}
              {maiorDegrauOk.totalMs} ms.
            </p>
          ) : null}
          {primeiraFalha ? (
            <p className={styles.erro}>
              Primeira falha a {primeiraFalha.megapixels} MP: {primeiraFalha.erro}
            </p>
          ) : null}
        </Secao>
      ) : null}

      {/* --------------------------------------------------------- relatorio */}
      {estado === 'concluido' || estado === 'falhou' ? (
        <Secao titulo="Relatorio">
          <p className={styles.nota}>
            Copie este bloco e cole-o em docs/browser-support.md, na linha do browser testado.
          </p>
          <textarea
            className={styles.relatorio}
            readOnly
            rows={16}
            value={JSON.stringify(relatorio, null, 2)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </Secao>
      ) : null}
    </div>
  )
}

function Secao({ titulo, children }: { readonly titulo: string; readonly children: React.ReactNode }) {
  return (
    <section className={styles.secao}>
      <h2 className={styles.tituloSecao}>{titulo}</h2>
      {children}
    </section>
  )
}

function Par({
  etiqueta,
  valor,
  quebrar = false,
}: {
  readonly etiqueta: string
  readonly valor: string
  readonly quebrar?: boolean
}) {
  return (
    <div className={styles.par}>
      <dt className="etiqueta">{etiqueta}</dt>
      <dd className={quebrar ? `${styles.valor} ${styles.quebrar}` : styles.valor}>{valor}</dd>
    </div>
  )
}
