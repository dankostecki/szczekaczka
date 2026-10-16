// The text of the reading window (components/Reader.tsx): `NewsItem.body` as blocks to draw. Plain text with three conventions: a line of its
// own is a paragraph, "- text" (also "* text", "• text") a list item (consecutive items are one list), "## text" a subheading. Nothing is
// taken as HTML: the texts come from other people's feeds.

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }

const ITEM = /^[-*•–]\s+(\S.*)$/
const HEADING = /^##\s+(\S.*)$/

export function parseBody(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || /^[-*•–#]+$/.test(line)) continue
    const item = ITEM.exec(line)
    if (item) {
      const last = blocks[blocks.length - 1]
      if (last?.t === 'ul') last.items.push(item[1])
      else blocks.push({ t: 'ul', items: [item[1]] })
      continue
    }
    const heading = HEADING.exec(line)
    blocks.push(heading ? { t: 'h', text: heading[1] } : { t: 'p', text: line })
  }
  return blocks
}

// A list item as it is drawn: MacroNext's rows ("Inflacja CPI rok do roku za wrzesień, konsensus 3,6%, poprzednio 3,3%.") as the name with the figures
// beside it; any other item with a short label before a colon ("Raport za III kwartał opublikują: Citigroup, …") with the label set apart
export interface ListItem { label?: string; text: string; figures?: { name: string; value: string }[] }

const FIGURE_AT = /,\s*(?:konsensus|poprzednio)\s/
const FIGURE = /,\s*(konsensus|poprzednio)\s+(.+?)(?=,\s*(?:konsensus|poprzednio)\s|$)/g
const LABEL = /^([^:]{2,60}):\s+(\S.*)$/

export function splitItem(text: string, source: string): ListItem {
  const label = LABEL.exec(text)
  const [head, rest] = label ? [label[1], label[2]] : [undefined, text]
  if (source === 'MACRONEXT') {
    const at = FIGURE_AT.exec(rest)
    if (at) {
      const figures = [...rest.slice(at.index).matchAll(FIGURE)].map((f) => ({ name: f[1], value: f[2].replace(/(?<=[\d%])\.$/, '').trim() }))
      return { ...(head ? { label: head } : {}), text: rest.slice(0, at.index), figures }
    }
  }
  return label ? { label: label[1], text: label[2] } : { text }
}
