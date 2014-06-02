_ = require 'underscore-plus'

{SelectListView, View} = require 'atom'

module.exports =
class SnippetsAvailable extends SelectListView

  # Public: Retrieve the active Editor.
  #
  # Returns: The active Editor as {Object}.
  editor: -> atom.workspace.getActiveEditor()

  # Public: Retrieve the active EditorView as {Object}.
  #
  # Returns: The active EditorView as {Object}.
  editorView: -> atom.workspaceView.getActiveView()

  # Public: Retrieve the active snippets package mainModule.
  #
  # Returns: The active snippet package mainModule as {Object}.
  snippets: -> atom.packages.activePackages.snippets.mainModule

  # Public: Filter the fuzzy-search for the prefix.
  #
  # Returns: {String}
  getFilterKey: -> 'prefix'

  # Public: Initialize object.
  #
  # Returns: `undefined`
  initialize: (@Snippets) ->
    super
    @addClass('overlay from-top')

    Snippets = require './snippets'
    snippets = Snippets.getSnippets @editor()
    items = ({'prefix': prefix, 'snippet': snippet} for prefix, snippet of snippets)

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
    Snippets = require './snippets'
    Snippets.insert item.snippet.bodyText
    @detach()
