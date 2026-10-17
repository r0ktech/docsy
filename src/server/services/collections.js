import 'server-only';
import { prisma } from '@/server/db';
import { Errors } from '@/server/errors';

export async function listCollections(userId) {
  const rows = await prisma.collection.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { documents: true } } },
  });
  return rows.map(serializeCollection);
}

export async function getCollection(userId, id) {
  const c = await prisma.collection.findFirst({
    where: { id, userId },
    include: { _count: { select: { documents: true } } },
  });
  if (!c) throw Errors.notFound('Collection');
  return serializeCollection(c);
}

async function assertNameAvailable(userId, name, exceptId) {
  const clash = await prisma.collection.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw Errors.conflict('COLLECTION_EXISTS', `You already have a collection called "${name}".`);
}

export async function createCollection(userId, { name, description }) {
  await assertNameAvailable(userId, name);
  try {
    const c = await prisma.collection.create({
      data: { userId, name, description: description || null },
      include: { _count: { select: { documents: true } } },
    });
    return serializeCollection(c);
  } catch (err) {
    if (err.code === 'P2002') throw Errors.conflict('COLLECTION_EXISTS', `You already have a collection called "${name}".`);
    throw err;
  }
}

export async function updateCollection(userId, id, data) {
  await getCollection(userId, id);
  if (data.name) await assertNameAvailable(userId, data.name, id);
  try {
    const c = await prisma.collection.update({
      where: { id },
      data: { name: data.name, description: data.description === undefined ? undefined : data.description || null },
      include: { _count: { select: { documents: true } } },
    });
    return serializeCollection(c);
  } catch (err) {
    if (err.code === 'P2002') throw Errors.conflict('COLLECTION_EXISTS', `You already have a collection called "${data.name}".`);
    throw err;
  }
}

/** Deleting a collection never deletes its documents. */
export async function deleteCollection(userId, id) {
  await getCollection(userId, id);
  await prisma.collection.delete({ where: { id } });
}

export async function addDocumentsToCollection(userId, collectionId, documentIds) {
  await getCollection(userId, collectionId);
  const owned = await prisma.document.findMany({ where: { id: { in: documentIds }, userId }, select: { id: true } });
  if (owned.length !== new Set(documentIds).size) throw Errors.notFound('Document');
  await prisma.collectionDocument.createMany({
    data: owned.map((d) => ({ collectionId, documentId: d.id })),
    skipDuplicates: true,
  });
  return getCollection(userId, collectionId);
}

export async function removeDocumentsFromCollection(userId, collectionId, documentIds) {
  await getCollection(userId, collectionId);
  await prisma.collectionDocument.deleteMany({
    where: { collectionId, documentId: { in: documentIds }, document: { userId } },
  });
  return getCollection(userId, collectionId);
}

function serializeCollection(c) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    documentCount: c._count?.documents ?? 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
