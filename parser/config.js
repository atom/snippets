module.exports = {
  input: './parser/snippet-body-parser.pegjs',
  output: './parser/snippet-body-parser.js',
  dependencies: {
    Snippet: '../constructs/snippet',
    Tabstop: '../constructs/tabstop',
    Variable: '../constructs/variable',
    Choice: '../modifiers/choice',
    Modifier: '../modifiers/modifier',
    Placeholder: '../modifiers/placeholder',
    Transformation: '../modifiers/transformation'
  }
}
