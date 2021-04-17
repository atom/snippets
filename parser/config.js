module.exports = {
  input: './parser/snippet-body-parser.pegjs',
  output: './parser/snippet-body-parser.js',
  dependencies: {
    Expression: '../expression/expression',
    Snippet: '../expression/snippet',
    Choice: '../expression/choice',
    Placeholder: '../expression/placeholder',
    Transformation: '../expression/transformation'
  }
}
