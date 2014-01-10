try
  parser = require './snippet-body'
catch
  {fs} = require 'atom'
  PEG = require 'pegjs'

  grammarSrc = fs.readFileSync(require.resolve('./snippet-body.pegjs'), 'utf8')
  parser = PEG.buildParser(grammarSrc)

module.exports = parser
