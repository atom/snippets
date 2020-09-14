module.exports = class Modifier {
  modify ([Construct, identifier]) {
    class Modifier extends Construct {}

    return new Modifier(identifier)
  }
}
