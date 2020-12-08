const SelectListView = require('atom-select-list')

module.exports = class AvailableSnippetsView extends SelectListView {
  constructor (snippets, editor) {
    super({
      items: Object.entries(snippets.snippetsByScopes()
        .getPropertyValue(editor.getRootScopeDescriptor().getScopeChain())),
      filterKeyForItem: ([name, { prefix }]) => prefix + name,
      elementForItem: ([name, { prefix }]) => {
        const li = document.createElement('li')
        li.classList.add('two-lines')

        const primaryLine = document.createElement('div')
        primaryLine.classList.add('primary-line')
        primaryLine.textContent = prefix
        li.appendChild(primaryLine)

        const secondaryLine = document.createElement('div')
        secondaryLine.classList.add('secondary-line')
        secondaryLine.textContent = name
        li.appendChild(secondaryLine)

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
