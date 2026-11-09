/**
 * The search box over the SPS lines (10.2.0): it hides the lines that do not
 * match, opens the groups that still have one, and puts everything back when
 * cleared. Without script the page is the whole list, as before. Served as a
 * script of its own because the CSP blocks inline ones.
 */
export const INTRAOP_SEARCH_SCRIPT = `(function () {
  var box = document.querySelector('[data-testid="intraop-search"]')
  var form = document.querySelector('[data-testid="intraop-form"]')
  if (!box || !form) return
  var count = document.querySelector('[data-testid="intraop-search-count"]')
  var items = [].slice.call(form.querySelectorAll('.intraop-lines li'))
  var groups = [].slice.call(form.querySelectorAll('.intraop-lines'))
  function fold(text) { return String(text || '').toLowerCase().replace(/\\s+/g, ' ') }
  var texts = items.map(function (li) { return fold(li.textContent) })
  groups.forEach(function (group) { group.setAttribute('data-was-open', group.open ? '1' : '0') })
  function run() {
    var query = fold(box.value).trim()
    var shown = 0
    items.forEach(function (li, index) {
      var hit = !query || texts[index].indexOf(query) !== -1
      li.hidden = !hit
      if (hit && query) shown++
    })
    groups.forEach(function (group) {
      var any = group.querySelector('li:not([hidden])')
      group.hidden = !!query && !any
      if (query) group.open = !!any
      else group.open = group.getAttribute('data-was-open') === '1'
    })
    if (count) {
      count.textContent = query ? shown + ' / ' + items.length : ''
      count.setAttribute('data-empty', query && shown === 0 ? '1' : '0')
    }
  }
  box.addEventListener('input', run)
  box.addEventListener('keydown', function (event) { if (event.key === 'Enter') event.preventDefault() })
})()
`
