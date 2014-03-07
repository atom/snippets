try
  parser = require './snippet-body'
catch
  {allowUnsafeEval} = require 'loophole'
  fs = require 'fs-plus'
  PEG = require 'pegjs'

  grammarSrc = fs.readFileSync(require.resolve('./snippet-body.pegjs'), 'utf8')
  parser = null
  allowUnsafeEval -> parser = PEG.buildParser(grammarSrc)

module.exports = parser
