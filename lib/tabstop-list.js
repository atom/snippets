module.exports = class TabstopList extends Array {
  constructor (markers) {
    super()

    const unknowns = []

    markers.forEach(marker => {
      const { construct } = marker.getProperties()

      Number.isInteger(construct.identifier)
        ? Array.isArray(this[construct.identifier])
          ? this[construct.identifier].push(marker.id)
          : this[construct.identifier] = [marker.id]
        : unknowns.push([marker.id])
    })
    // Include all unknown variables at the end
    if (unknowns.length) {
      this.push(...unknowns)
    }
    // Move 0th tabstop to last
    this.push(this.shift())
  }
}
