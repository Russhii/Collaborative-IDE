// The backend does NOT speak Yjs's binary update protocol — it only ever
// sends/receives whole-file text + a version number (see the file_update /
// file_updated handlers in backend/main.py). To bridge that with the Yjs
// CRDT doc without throwing away everything Yjs gives us locally (conflict
// -free merging of concurrent local ops, undo/redo, cursor-preserving
// edits), we don't just yText.delete(0, len) + insert(newContent).
//
// Instead we compute the shared prefix/suffix between what the doc has and
// the incoming snapshot, and only touch the differing middle span, applied
// inside a single Yjs transaction. Yjs still owns the actual CRDT merge of
// this op against any concurrent local edits; we're just turning a
// "snapshot" into a minimal "patch" so Yjs's machinery stays in charge.
export function applyRemoteSnapshot(ydoc, yText, nextContent, origin = "remote") {
  const current = yText.toString()
  if (current === nextContent) return

  let prefix = 0
  const maxPrefix = Math.min(current.length, nextContent.length)
  while (prefix < maxPrefix && current[prefix] === nextContent[prefix]) {
    prefix++
  }

  let suffix = 0
  const maxSuffix = Math.min(current.length, nextContent.length) - prefix
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === nextContent[nextContent.length - 1 - suffix]
  ) {
    suffix++
  }

  const deleteLength = current.length - prefix - suffix
  const insertText = nextContent.slice(prefix, nextContent.length - suffix)

  ydoc.transact(() => {
    if (deleteLength > 0) yText.delete(prefix, deleteLength)
    if (insertText.length > 0) yText.insert(prefix, insertText)
  }, origin)
}
