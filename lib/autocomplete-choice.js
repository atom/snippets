module.exports = class ChoiceProvider {
  constructor () {
    this.selector = '*'
    this.inclusionPriority = -Infinity
    this.suggestionPriority = 100
    this.filterSuggestions = true
    this.excludeLowerPriority = false
    this.active = false
    this.choices = []
  }

  getSuggestions () {
    // TODO: Show all when just on default, show filtered and sorted when started typing
    // TODO: Show even when no prefix
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
  }

  deactivate () {
    this.active = false
    this.inclusionPriority = -Infinity
    this.suggestionPriority = -Infinity
    this.excludeLowerPriority = false
    this.choices = []
  }
}
