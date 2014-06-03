_ = require 'underscore-plus'

{SelectListView, View} = require 'atom'

module.exports =
class SnippetsAvailable extends SelectListView

  # Public: Retrieve the active Editor.
  #
  # Returns: The active Editor as {Object}.
  editor: -> atom.workspace.getActiveEditor()

  # Public: Filter the fuzzy-search for the prefix.
  #
  # Returns: {String}
  getFilterKey: -> 'prefix'

  # Public: Initialize object.
  #
  # Returns: `undefined`
  initialize: (@snippets) ->
    super
    @addClass('overlay from-top')
    items = ({prefix, snippet} for prefix, snippet of snippets.getSnippets(@editor()))

    @setItems(items)
    atom.workspaceView.append(this)
    @focusFilterEditor()

  # Public: Implement SelectListView method to generate the view for each item.
  #
  # item - The {Object} containing the snippet information.
  #
  # Returns: `undefined`
  viewForItem: (item) ->
    View.render ->
      @li class: 'two-lines', =>
        @div class: 'primary-line', "#{item.prefix}"
        @div class: 'secondary-line', "#{item.snippet.name}"

  # Public: Implement SelectListView method to process the user selection.
  #
  # item - The {Object} to insert the snippet.
  #
  # Returns: `undefined`
  confirmed: (item) ->
    @snippets.insert item.snippet.bodyText
    @detach()
