// MongoDB GridFS stores binary evidence (photos, videos, selfies, CCTV frames).
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { mongoUrl, mongoDb } = require('../config');

const client = new MongoClient(mongoUrl);
let bucket;

async function connect() {
  await client.connect();
  bucket = new GridFSBucket(client.db(mongoDb), { bucketName: 'evidence' });
  return bucket;
}

function putFile(buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(filename, { metadata });
    up.once('error', reject).once('finish', () => resolve(up.id.toHexString()));
    up.end(buffer);
  });
}

async function fileInfo(id) {
  if (!ObjectId.isValid(id)) return null;
  return bucket.find({ _id: new ObjectId(id) }).next();
}

const openDownload = id => bucket.openDownloadStream(new ObjectId(id));
const deleteFile = id => bucket.delete(new ObjectId(id));

module.exports = { connect, putFile, fileInfo, openDownload, deleteFile, client };
