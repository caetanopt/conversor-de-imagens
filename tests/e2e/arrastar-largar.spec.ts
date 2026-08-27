import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

/**
 * Arrastar e largar, por um evento `drop` real.
 *
 * Os outros specs anexam ficheiros com `DataTransfer` só para disparar
 * `change` no input escondido — nunca um evento `drop` na própria zona
 * (`setInputFiles` não simula arrastar, só escolher ficheiro). Isso deixava
 * os handlers reais de DropZone.tsx (dragenter, dragover, drop, e o contador
 * que existe especificamente para dragenter/dragleave também dispararem nos
 * filhos) sem nenhuma cobertura, apesar de ser o critério 3 do MVP,
 * CLAUDE.md secção 28.
 *
 * `DragEvent` com um `dataTransfer` populado é construído dentro da página, à
 * semelhança do padrão já usado para nomes Unicode em privacidade.spec.ts.
 */

const FIXTURES = resolve(import.meta.dirname, '../fixtures')
const JPG = resolve(FIXTURES, 'jpeg-normal.jpg')

test('largar um ficheiro na zona, com um evento drop real, adiciona-o à fila', async ({ page }) => {
  await page.goto('/')
  const bytes = [...readFileSync(JPG)]

  await page.evaluate((bytesArray) => {
    const zona = document.querySelector<HTMLElement>('[class*="__zona"]')
    if (!zona) throw new Error('zona de largar não encontrada')

    const ficheiro = new File([new Uint8Array(bytesArray)], 'largado-por-drop.jpg', {
      type: 'image/jpeg',
    })
    const dt = new DataTransfer()
    dt.items.add(ficheiro)
    const opcoes = { dataTransfer: dt, bubbles: true, cancelable: true }

    zona.dispatchEvent(new DragEvent('dragenter', opcoes))
    zona.dispatchEvent(new DragEvent('dragover', opcoes))
    zona.dispatchEvent(new DragEvent('drop', opcoes))
  }, bytes)

  await expect(page.getByText('largado-por-drop.jpg')).toBeVisible()
})

test('a moldura de arrasto não desliga quando o bubbling passa por um filho', async ({ page }) => {
  await page.goto('/')

  const { reagiuAoEntrar, continuaSobreposta } = await page.evaluate(async () => {
    const zona = document.querySelector<HTMLElement>('[class*="__zona"]')
    const filho = zona?.querySelector<HTMLElement>('h1')
    if (!zona || !filho) throw new Error('zona ou filho não encontrados')

    // React comita o novo className de forma assincrona, nao no mesmo tick
    // sincrono do dispatchEvent. Um unico requestAnimationFrame chegava na
    // maioria das corridas mas nao logo a seguir a um page.goto() fresco;
    // espera ate ao valor esperado ou 500ms, o que vier primeiro, em vez de
    // assumir um numero fixo de frames.
    async function esperarBorda(valor: string, prazoMs = 500): Promise<string> {
      const fim = Date.now() + prazoMs
      let atual = getComputedStyle(zona!).borderStyle
      while (atual !== valor && Date.now() < fim) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        atual = getComputedStyle(zona!).borderStyle
      }
      return atual
    }

    const dt = new DataTransfer()
    const opcoes = { dataTransfer: dt, bubbles: true, cancelable: true }

    zona.dispatchEvent(new DragEvent('dragenter', opcoes))
    const reagiuAoEntrar = (await esperarBorda('solid')) === 'solid'

    // dragenter e dragleave num filho tambem disparam na zona, por bubbling
    // (comentario em DropZone.tsx). Sem o contador, o dragleave do filho
    // desligaria a moldura mesmo com o arrasto ainda sobre a zona. Aqui nao
    // ha nenhuma mudanca de estado a esperar — o teste e precisamente que
    // NADA muda — por isso um prazo curto e fixo, nao esperarBorda.
    filho.dispatchEvent(new DragEvent('dragenter', opcoes))
    filho.dispatchEvent(new DragEvent('dragleave', opcoes))
    await new Promise<void>((r) => setTimeout(r, 150))

    const continuaSobreposta = getComputedStyle(zona).borderStyle === 'solid'
    return { reagiuAoEntrar, continuaSobreposta }
  })

  expect(reagiuAoEntrar, 'a zona reage ao dragenter inicial').toBe(true)
  expect(continuaSobreposta, 'a moldura sobrevive ao bubbling de um filho').toBe(true)
})
