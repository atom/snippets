module.exports = class ChoiceProvider {
  constructor () {
    this.selector = '*'
    this.inclusionPriority = -Infinity
    this.suggestionPriority = 100
    this.filterSuggestions = false
    this.excludeLowerPriority = false
    this.active = false
    this.choices = []
  }

  getSuggestions () {
    // TODO: Show all when just on default, show filtered and sorted when started typing
    // TODO: Show even when no prefix
    console.log("getting suggestions")
    // debugger
    if (!this.active) { return undefined }
    return this.choices.map(c => {
      return {
        text: c,
        type: "constant"
      }
    })
  }

  activate (choices) {
    this.active = true
    this.inclusionPriority = 1000
    this.suggestionPriority = 1000
    this.excludeLowerPriority = true
    this.choices = choices

    this.oldConfig = atom.config.get("autocomplete-plus.autoActivationEnabled")
    atom.config.set("autocomplete-plus.autoActivationEnabled", false, { save: false })

    setTimeout(() => {
      atom.commands.dispatch(document.activeElement, "autocomplete-plus:activate") // TODO: Remove dependency on specific provider
    }, 5) // Because expanding the snippet from the autocomplete-menu immediately to a choice catches the close of the existing menu
  }

  deactivate () {
    this.active = false
    this.inclusionPriority = -Infinity
    this.suggestionPriority = -Infinity
    this.excludeLowerPriority = false
    this.choices = []
    atom.config.set("autocomplete-plus.autoActivationEnabled", this.oldConfig, { save: false })
  }
}
