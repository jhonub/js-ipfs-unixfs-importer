/* eslint-env mocha */
'use strict'

const importer = require('./../src')
const expect = require('chai').expect
const IPFSRepo = require('ipfs-repo')
const BlockService = require('ipfs-blocks').BlockService
const DAGService = require('ipfs-merkle-dag').DAGService
const DAGNode = require('ipfs-merkle-dag').DAGNode
const fsBlobStore = require('fs-blob-store')
const bs58 = require('bs58')
const fs = require('fs')
const UnixFS = require('ipfs-unixfs')
const path = require('path')

let ds

describe('layout: importer', function () {
  const big = path.join(__dirname, '/test-data/1.2MiB.txt')
  const small = path.join(__dirname, '/test-data/200Bytes.txt')
  const dirSmall = path.join(__dirname, '/test-data/dir-small')
  const dirBig = path.join(__dirname, '/test-data/dir-big')
  const dirNested = path.join(__dirname, '/test-data/dir-nested')

  // check to see if missing empty dirs need to be created

  fs.stat(path.join(__dirname, '/test-data/dir-nested/dir-another'), function (err, exists) {
    if (err) {
      fs.mkdir(path.join(__dirname, '/test-data/dir-nested/dir-another'))
    }
  })
  fs.stat(path.join(__dirname, '/test-data/dir-nested/level-1/level-2'), function (err, exists) {
    if (err) {
      fs.mkdir(path.join(__dirname, '/test-data/dir-nested/level-1/level-2'))
    }
  })

  it('start dag service', function (done) {
    const options = {
      stores: {
        keys: fsBlobStore,
        config: fsBlobStore,
        datastore: fsBlobStore,
        // datastoreLegacy: needs https://github.com/ipfsBlobStore/js-ipfsBlobStore-repo/issues/6#issuecomment-164650642
        logs: fsBlobStore,
        locks: fsBlobStore,
        version: fsBlobStore
      }
    }
    const repo = new IPFSRepo(process.env.IPFS_PATH, options)
    const bs = new BlockService(repo)
    ds = new DAGService(bs)
    expect(bs).to.exist
    expect(ds).to.exist
    done()
  })

  it('import a bad path', (done) => {
    importer.import('/foo/bar/quux/a!wofjaeiwojfoiew', ds, function (err, stat) {
      expect(err).to.exist
      done()
    })
  })

  it('import a small file', (done) => {
    importer.import(small, ds, function (err, stat) {
      expect(err).to.not.exist
      ds.get(stat.Hash, (err, node) => {
        expect(err).to.not.exist
        const smallDAGNode = new DAGNode()
        const buf = fs.readFileSync(small + '.block')
        smallDAGNode.unMarshal(buf)
        expect(node.size()).to.equal(smallDAGNode.size())
        expect(node.multihash()).to.deep.equal(smallDAGNode.multihash())
        done()
      })
    })
  })

  it('import a big file', (done) => {
    importer.import(big, ds, function (err, stat) {
      expect(err).to.not.exist
      ds.get(stat.Hash, (err, node) => {
        expect(err).to.not.exist

        const bigDAGNode = new DAGNode()
        const buf = fs.readFileSync(big + '.block')
        bigDAGNode.unMarshal(buf)
        expect(node.size()).to.equal(bigDAGNode.size())
        expect(node.links).to.deep.equal(bigDAGNode.links)

        const nodeUnixFS = UnixFS.unmarshal(node.data)
        const bigDAGNodeUnixFS = UnixFS.unmarshal(bigDAGNode.data)
        expect(nodeUnixFS.type).to.equal(bigDAGNodeUnixFS.type)
        expect(nodeUnixFS.data).to.deep.equal(bigDAGNodeUnixFS.data)
        expect(nodeUnixFS.blockSizes).to.deep.equal(bigDAGNodeUnixFS.blockSizes)
        expect(nodeUnixFS.fileSize()).to.equal(bigDAGNodeUnixFS.fileSize())

        expect(node.data).to.deep.equal(bigDAGNode.data)
        expect(node.multihash()).to.deep.equal(bigDAGNode.multihash())

        ds.get(node.links[0].hash, (err, node) => {
          expect(err).to.not.exist
          const leaf = new DAGNode()
          const buf2 = fs.readFileSync(big + '.link-block0')
          leaf.unMarshal(buf2)
          expect(node.links).to.deep.equal(leaf.links)
          expect(node.links.length).to.equal(0)
          expect(leaf.links.length).to.equal(0)
          expect(leaf.marshal()).to.deep.equal(buf2)
          const nodeUnixFS = UnixFS.unmarshal(node.data)
          const leafUnixFS = UnixFS.unmarshal(leaf.data)
          expect(nodeUnixFS.type).to.equal(leafUnixFS.type)
          expect(nodeUnixFS.fileSize()).to.equal(leafUnixFS.fileSize())
          expect(nodeUnixFS.data).to.deep.equal(leafUnixFS.data)
          expect(nodeUnixFS.blockSizes).to.deep.equal(leafUnixFS.blockSizes)
          expect(node.data).to.deep.equal(leaf.data)
          expect(node.marshal()).to.deep.equal(leaf.marshal())
          done()
        })
      })
    })
  })

  it('import a small directory', (done) => {
    importer.import(dirSmall, ds, {
      recursive: true
    }, function (err, stats) {
      expect(err).to.not.exist

      ds.get(stats.Hash, (err, node) => {
        expect(err).to.not.exist
        const dirSmallNode = new DAGNode()
        const buf = fs.readFileSync(dirSmall + '.block')
        dirSmallNode.unMarshal(buf)
        expect(node.links).to.deep.equal(dirSmallNode.links)

        const nodeUnixFS = UnixFS.unmarshal(node.data)
        const dirUnixFS = UnixFS.unmarshal(dirSmallNode.data)

        expect(nodeUnixFS.type).to.equal(dirUnixFS.type)
        expect(nodeUnixFS.fileSize()).to.equal(dirUnixFS.fileSize())
        expect(nodeUnixFS.data).to.deep.equal(dirUnixFS.data)
        expect(nodeUnixFS.blockSizes).to.deep.equal(dirUnixFS.blockSizes)
        expect(node.data).to.deep.equal(dirSmallNode.data)
        expect(node.marshal()).to.deep.equal(dirSmallNode.marshal())
        done()
      })
    })
  })

  it('import a big directory', (done) => {
    importer.import(dirBig, ds, {
      recursive: true
    }, function (err, stats) {
      expect(err).to.not.exist

      ds.get(stats.Hash, (err, node) => {
        expect(err).to.not.exist
        const dirNode = new DAGNode()
        const buf = fs.readFileSync(dirBig + '.block')
        dirNode.unMarshal(buf)
        expect(node.links).to.deep.equal(dirNode.links)

        const nodeUnixFS = UnixFS.unmarshal(node.data)
        const dirUnixFS = UnixFS.unmarshal(dirNode.data)

        expect(nodeUnixFS.type).to.equal(dirUnixFS.type)
        expect(nodeUnixFS.fileSize()).to.equal(dirUnixFS.fileSize())
        expect(nodeUnixFS.data).to.deep.equal(dirUnixFS.data)
        expect(nodeUnixFS.blockSizes).to.deep.equal(dirUnixFS.blockSizes)
        expect(node.data).to.deep.equal(dirNode.data)
        expect(node.marshal()).to.deep.equal(dirNode.marshal())
        done()
      })
    })
  })

  it('import a nested directory', (done) => {
    importer.import(dirNested, ds, {
      recursive: true
    }, function (err, stats) {
      expect(err).to.not.exist
      expect(bs58.encode(stats.Hash).toString()).to.equal('QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN')

      ds.get(stats.Hash, (err, node) => {
        expect(err).to.not.exist
        expect(node.links.length).to.equal(3)

        const dirNode = new DAGNode()
        const buf = fs.readFileSync(dirNested + '.block')
        dirNode.unMarshal(buf)
        expect(node.links).to.deep.equal(dirNode.links)
        expect(node.data).to.deep.equal(dirNode.data)
        done()
      })
    })
  })

  it('import a small buffer', (done) => {
    // this is just like "import a small file"
    const buf = fs.readFileSync(path.join(__dirname, '/test-data/200Bytes.txt'))
    importer.import(buf, ds, function (err, stat) {
      expect(err).to.not.exist
      ds.get(stat.Hash, (err, node) => {
        expect(err).to.not.exist
        const smallDAGNode = new DAGNode()
        const marbuf = fs.readFileSync(small + '.block')
        smallDAGNode.unMarshal(marbuf)
        expect(node.size()).to.equal(smallDAGNode.size())
        expect(node.multihash()).to.deep.equal(smallDAGNode.multihash())
        done()
      })
    })
  })

  it('import a big buffer', (done) => {
    // this is just like "import a big file"
    const buf = fs.readFileSync(path.join(__dirname, '/test-data/1.2MiB.txt'))
    importer.import(buf, ds, function (err, stat) {
      expect(err).to.not.exist
      ds.get(stat.Hash, (err, node) => {
        expect(err).to.not.exist

        const bigDAGNode = new DAGNode()
        const marbuf = fs.readFileSync(big + '.block')
        bigDAGNode.unMarshal(marbuf)
        expect(node.size()).to.equal(bigDAGNode.size())
        expect(node.links).to.deep.equal(bigDAGNode.links)

        const nodeUnixFS = UnixFS.unmarshal(node.data)
        const bigDAGNodeUnixFS = UnixFS.unmarshal(bigDAGNode.data)
        expect(nodeUnixFS.type).to.equal(bigDAGNodeUnixFS.type)
        expect(nodeUnixFS.data).to.deep.equal(bigDAGNodeUnixFS.data)
        expect(nodeUnixFS.blockSizes).to.deep.equal(bigDAGNodeUnixFS.blockSizes)
        expect(nodeUnixFS.fileSize()).to.equal(bigDAGNodeUnixFS.fileSize())

        expect(node.data).to.deep.equal(bigDAGNode.data)
        expect(node.multihash()).to.deep.equal(bigDAGNode.multihash())

        ds.get(node.links[0].hash, (err, node) => {
          expect(err).to.not.exist
          const leaf = new DAGNode()

          const marbuf2 = fs.readFileSync(big + '.link-block0')
          leaf.unMarshal(marbuf2)
          expect(node.links).to.deep.equal(leaf.links)
          expect(node.links.length).to.equal(0)
          expect(leaf.links.length).to.equal(0)
          expect(leaf.marshal()).to.deep.equal(marbuf2)
          const nodeUnixFS = UnixFS.unmarshal(node.data)
          const leafUnixFS = UnixFS.unmarshal(leaf.data)
          expect(nodeUnixFS.type).to.equal(leafUnixFS.type)
          expect(nodeUnixFS.fileSize()).to.equal(leafUnixFS.fileSize())
          expect(nodeUnixFS.data).to.deep.equal(leafUnixFS.data)
          expect(nodeUnixFS.blockSizes).to.deep.equal(leafUnixFS.blockSizes)
          expect(node.data).to.deep.equal(leaf.data)
          expect(node.marshal()).to.deep.equal(leaf.marshal())
          done()
        })
      })
    })
  })

  it.skip('import from a readable stream', (done) => {
  })
})

describe('layout: exporter', function () {
  it('export a file with no links', (done) => {
    const hash = 'QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8'
    const testExport = importer.export(hash, ds)
    testExport.on('file', (data) => {
      ds.get(hash, (err, fetchedNode) => {
        expect(err).to.not.exist
        const unmarsh = UnixFS.unmarshal(fetchedNode.data)
        expect(unmarsh.data).to.deep.equal(data.stream._readableState.buffer[0])
        done()
      })
    })
  })

  it('export a small file with links', (done) => {
    const hash = 'QmW7BDxEbGqxxSYVtn3peNPQgdDXbWkoQ6J1EFYAEuQV3Q'
    const testExport = importer.export(hash, ds)
    testExport.on('file', (data) => {
      var ws = fs.createWriteStream(path.join(process.cwd(), '/test', data.path))
      data.stream.pipe(ws)
      data.stream.on('end', () => {
        const stats = fs.existsSync(path.join(process.cwd(), '/test', data.path))
        expect(stats).to.equal(true)
        fs.unlinkSync(path.join(process.cwd(), '/test', data.path))
        done()
      })
    })
  })

  it('export a large file > 5mb', (done) => {
    const hash = 'QmRQgufjp9vLE8XK2LGKZSsPCFCF6e4iynCQtNB5X2HBKE'
    const testExport = importer.export(hash, ds)
    testExport.on('file', (data) => {
      var ws = fs.createWriteStream(path.join(process.cwd(), '/test', data.path))
      data.stream.pipe(ws)
      data.stream.on('end', () => {
        const stats = fs.existsSync(path.join(process.cwd(), '/test', data.path))
        expect(stats).to.equal(true)
        fs.unlinkSync(path.join(process.cwd(), '/test', data.path))
        done()
      })
    })
  })

  it('export a directory', (done) => {
    const hash = 'QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN'
    var testExport = importer.export(hash, ds)
    var fs = []
    var x = 0
    testExport.on('file', (data) => {
      fs.push(data)
      x++
      if (x === 4) {
        expect(fs[0].path).to.equal('QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN/200Bytes.txt')
        expect(fs[1].path).to.equal('QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN/dir-another')
        expect(fs[2].path).to.equal('QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN/level-1/200Bytes.txt')
        expect(fs[3].path).to.equal('QmWChcSFMNcFkfeJtNd8Yru1rE6PhtCRfewi1tMwjkwKjN/level-1/level-2')
        done()
      }
    })
  })
})