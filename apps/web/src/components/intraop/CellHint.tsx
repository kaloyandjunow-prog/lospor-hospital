/**
 * What an empty cell of a lane says. Written out in every cell it was the same word eleven times over, and in a row
 * where something is already running it said nothing useful: so the word shows once, at "now", in a row with nothing
 * running; anywhere else a quiet "+" appears only where the pointer (or the last tap) is.
 */
export function CellHint({ text, show, className }: { text: string; show: boolean; className: string }) {
  return (
    <span data-tt-placeholder {...(show ? {} : { "data-tt-hint": "" })} className={className}>
      {show ? text : "+"}
    </span>
  )
}
