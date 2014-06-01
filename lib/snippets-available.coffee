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

    snippets = @getSnippets @editor()
    items = []
    for prefix, snippet of snippets
      items.push {'prefix': prefix, 'snippet': snippet}

    @setItems(items)
    atom.workspaceView.append(this)
    @focusFilterEditor()

  # Public: Collect all available snippets.
  #
  # editor - The {Object} representing the editor to check the scope.
  #
  # Returns an array with {Object}:
  #    :prefix - The snippet prefix as {String}.
  #    :snippet - The snippet-{Object}.
  getSnippets: (editor) ->
    scope = editor.getCursorScopes()
    snippets = {}
    for properties in atom.syntax.propertiesForScope(scope, 'snippets')
      snippetProperties = _.valueForKeyPath(properties, 'snippets') ? {}
      for snippetPrefix, snippet of snippetProperties
        snippets[snippetPrefix] ?= snippet
    snippets

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
    @snippets()?.insert item.snippet.bodyText
