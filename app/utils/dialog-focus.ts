/** Keep Tab cycling inside a modal, including at the browser-chrome boundary. */
export function trapDialogFocus(event: KeyboardEvent, dialog?: HTMLDialogElement) {
  if (!dialog || event.key !== 'Tab') return
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0)
  const first = controls[0],
    last = controls.at(-1)
  if (!first || !last) {
    event.preventDefault()
    dialog.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
