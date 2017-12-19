SnippetHistoryProvider = require './snippet-history-provider'

class EditorStore
  constructor: (@editor) ->
    @buffer = @editor.getBuffer()
    @observer = null
    @checkpoint = null
    @expansions = []
    @existingHistoryProvider = null


  getExpansions: ->
    @expansions

  setExpansions: (list) ->
    @expansions = list

  clearExpansions: ->
    @expansions = []

  addExpansion: (snippetExpansion) ->
    @expansions.push(snippetExpansion)

  observeHistory: (delegates) ->
    unless @existingHistoryProvider?
      @existingHistoryProvider = @buffer.historyProvider

    newProvider = SnippetHistoryProvider(@existingHistoryProvider, delegates)
    @buffer.setHistoryProvider(newProvider)

  stopObservingHistory: (editor) ->
    return unless @existingHistoryProvider?
    @buffer.setHistoryProvider(@existingHistoryProvider)
    @existingHistoryProvider = null

  observe: (callback) ->
    @observer.dispose() if @observer?
    @observer = @buffer.onDidChangeText(callback)

  stopObserving: ->
    return false unless @observer?
    @observer.dispose()
    @observer = null
    true

  makeCheckpoint: ->
    existing = @checkpoint
    if existing
      # changes = @buffer.getChangesSinceCheckpoint(existing)
      @buffer.groupChangesSinceCheckpoint(existing)
      # return unless changes.length > 0
    @checkpoint = @buffer.createCheckpoint()


Object.assign(EditorStore, {
  store: new WeakMap()
  findOrCreate: (editor) ->
    unless @store.has(editor)
      @store.set(editor, new EditorStore(editor))
    @store.get(editor)
})

module.exports = EditorStore
