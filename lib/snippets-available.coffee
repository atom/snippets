_ = require 'underscore-plus'
{$$, SelectListView} = require 'atom'

module.exports =
class SnippetsAvailable extends SelectListView
  # Public: Initialize object.
  #
  # Returns: `undefined`
  initialize: (@snippets) ->
    super
    @addClass('overlay from-top available-snippets')
    @command 'snippets:available', => @toggle()

  # Public: Filter the fuzzy-search for the prefix.
  #
  # Returns: {String}
  getFilterKey: -> 'searchText'

  toggle: (@editor) ->
    if @hasParent()
      @cancel()
    else
      @populate()
      @attach()

  detach: ->
    @editor = null
    super

  populate: ->
    snippets = _.values(@snippets.getSnippets(@editor))
    for snippet in snippets
      snippet.searchText = _.compact([snippet.prefix, snippet.name]).join(' ')
    @setItems(snippets)

  attach: ->
    @storeFocusedElement()
    atom.workspaceView.append(this)
    @focusFilterEditor()

  # Public: Implement SelectListView method to generate the view for each item.
  #
  # snippet - The snippet {Object} to render a view for.
  #
  # Returns: `undefined`
  viewForItem: (snippet) ->
    $$ ->
      @li class: 'two-lines', =>
        @div class: 'primary-line', snippet.prefix
        @div class: 'secondary-line', snippet.name

  # Public: Implement SelectListView method to process the user selection.
  #
  # snippet - The snippet {Object} to insert.
  #
  # Returns: `undefined`
  confirmed: (snippet) ->
    @cancel()
    @snippets.insert snippet.bodyText
