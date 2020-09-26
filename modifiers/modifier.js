module.exports = class Modifier {
  create ([Construct, ...args]) {
    // Don't actually modify the Construct
    return new Construct(...args)
  }
}
