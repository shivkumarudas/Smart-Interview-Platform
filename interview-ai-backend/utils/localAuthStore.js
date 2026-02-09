const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "local-auth-users.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]", "utf8");
  }
}

async function readUsers() {
  await ensureStore();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(users, null, 2), "utf8");
}

function normalizeLocalUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: String(user.id || ""),
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim().toLowerCase(),
    password: String(user.password || ""),
    createdAt: user.createdAt || new Date().toISOString()
  };
}

async function findByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const users = await readUsers();
  const found = users.find(
    (user) => String(user?.email || "").trim().toLowerCase() === normalizedEmail
  );

  return normalizeLocalUser(found);
}

async function createUser({ name, email, passwordHash }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !passwordHash) {
    throw new Error("Missing local user fields");
  }

  const users = await readUsers();
  const exists = users.some(
    (user) => String(user?.email || "").trim().toLowerCase() === normalizedEmail
  );

  if (exists) {
    const error = new Error("Email already exists");
    error.code = "EMAIL_EXISTS";
    throw error;
  }

  const newUser = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"),
    name: String(name || "").trim(),
    email: normalizedEmail,
    password: String(passwordHash),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeUsers(users);

  return normalizeLocalUser(newUser);
}

async function updateUserPassword(email, passwordHash) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !passwordHash) return false;

  const users = await readUsers();
  const index = users.findIndex(
    (user) => String(user?.email || "").trim().toLowerCase() === normalizedEmail
  );

  if (index < 0) return false;

  users[index] = {
    ...users[index],
    password: String(passwordHash)
  };

  await writeUsers(users);
  return true;
}

module.exports = {
  findByEmail,
  createUser,
  updateUserPassword
};

