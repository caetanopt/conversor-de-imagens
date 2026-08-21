/// <reference lib="webworker" />
/**
 * Worker de imagem.
 *
 * Todo o trabalho pesado acontece aqui. A main thread nunca carrega o WASM,
 * o que se verifica em teste: o motor nao pode aparecer em nenhum bundle do
 * cliente fora do chunk deste worker.
 *
 * Nao existe nenhuma chamada de rede neste ficheiro. O binario e carregado
 * pelo proprio magick-wasm a partir de um URL da nossa origem, o que permite
 * a regra de lint que proibe fetch nesta camada ser absoluta.
 */
import { MagickImageEngine } from '@/lib/image-engine/magick/MagickImageEngine'
import { classificarErroDoMotor } from '@/lib/image-engine/protocol'
import type { WorkerRequest, WorkerResponse } from '@/lib/image-engine/protocol'

const motor = new MagickImageEngine()

function responder(resposta: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(resposta, { transfer })
  } else {
    self.postMessage(resposta)
  }
}

function responderErro(requestId: string, erro: unknown): void {
  const bruto = erro instanceof Error ? erro.message : String(erro)
  const classificado = classificarErroDoMotor(bruto)
  // `detail` guarda o texto do motor apenas para diagnostico em
  // desenvolvimento. Nunca e mostrado ao utilizador, e nunca contem nome de
  // ficheiro nem metadados da imagem.
  responder({
    kind: 'erro',
    requestId,
    errorKind: classificado.kind,
    message: classificado.message,
    ...(classificado.suggestion === undefined ? {} : { suggestion: classificado.suggestion }),
    detail: bruto.slice(0, 200),
  })
}

self.addEventListener('message', async (evento: MessageEvent<WorkerRequest>) => {
  const pedido = evento.data

  try {
    switch (pedido.kind) {
      case 'arrancar': {
        const inicio = performance.now()
        await motor.initialize(pedido.wasmUrl)
        responder({
          kind: 'arrancado',
          requestId: pedido.requestId,
          initMs: Math.round(performance.now() - inicio),
        })
        return
      }

      case 'capacidades': {
        const capabilities = await motor.getCapabilities()
        responder({ kind: 'capacidades', requestId: pedido.requestId, capabilities })
        return
      }

      case 'inspecionar': {
        const inspection = await motor.inspect(pedido.bytes, {
          magickFormat: pedido.magickFormatHint,
        })
        responder({ kind: 'inspecionado', requestId: pedido.requestId, inspection })
        return
      }

      case 'converter': {
        const r = await motor.convert(pedido.bytes, pedido.options)
        // Transferido, nao copiado: o buffer sai daqui sem duplicar megabytes.
        const buffer = r.bytes.buffer as ArrayBuffer
        responder(
          {
            kind: 'convertido',
            requestId: pedido.requestId,
            bytes: buffer,
            width: r.width,
            height: r.height,
            formatId: r.formatId,
            durationMs: r.durationMs,
            decodeMs: r.decodeMs,
            encodeMs: r.encodeMs,
            profilesKept: r.profilesKept,
          },
          [buffer],
        )
        return
      }
    }
  } catch (erro) {
    responderErro(pedido.requestId, erro)
  }
})
