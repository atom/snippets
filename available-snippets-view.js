const SelectListView = require('atom-select-list')

module.exports = class AvailableSnippetsView extends SelectListView {
  constructor (snippets, editor) {
    super({
      items: Object.entries(snippets.snippetsByScopes()
        .getPropertyValue(editor.getRootScopeDescriptor().getScopeChain())),
      filterKeyForItem: ([name, { prefix }]) => prefix + name,
      elementForItem: ([name, { prefix, description }]) => {
        const li = document.createElement('li')
        li.classList.add('two-lines')

        const primaryLine = li.appendChild(document.createElement('div'))
        primaryLine.classList.add('primary-line')
        primaryLine.textContent = prefix

        const secondaryLine = li.appendChild(document.createElement('div'))
        secondaryLine.classList.add('secondary-line')
        // TODO: Nullish coalescing operator
        secondaryLine.textContent = description != null ? description : name

        return li
      },
      emptyMessage: 'No snippets defined for this Grammar.',
      itemsClassList: ['available-snippets'],
      didConfirmSelection: ([, { body }]) => {
        this.destroy()
        editor.getCursors().forEach(cursor =>
          snippets.parse(body).expand({ editor, cursor }))
      },
      didConfirmEmptySelection: () => this.destroy(),
      didCancelSelection: () => this.destroy()
    })

    const panel = atom.workspace.addModalPanel({ item: this })
    this.disposables.add(
      // Register cleanup disposables to be called on desctruction
      { dispose: () => document.activeElement.focus },
      { dispose: () => { panel.destroy() } })

    this.focus()
  }
}
