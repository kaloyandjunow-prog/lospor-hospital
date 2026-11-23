/** The part of a running item that lies after "now": the item's own colour in slanted stripes, aligned from cell to cell. */
export function runOnStripes(color: string, column: number, columnWidth: number): React.CSSProperties {
  const line = `linear-gradient(135deg, transparent 42%, ${color} 42%, ${color} 58%, transparent 58%)`
  return { backgroundImage: line, backgroundSize: "9px 9px", backgroundPositionX: `${-column * columnWidth}px` }
}
