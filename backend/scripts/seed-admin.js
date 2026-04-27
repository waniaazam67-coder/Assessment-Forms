const bcrypt = require("bcryptjs");
const { initializeDatabase, findAdminUserByEmail, createAdminUser } = require("../src/db");

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : "";
};

const main = async () => {
  const name = getArgValue("name");
  const email = getArgValue("email").toLowerCase();
  const password = getArgValue("password");
  const role = getArgValue("role") || "admin";

  if (!name || !email || !password) {
    throw new Error("Usage: npm run seed:admin -- --name=\"Admin User\" --email=\"admin@example.com\" --password=\"strong-password\" [--role=admin]");
  }

  await initializeDatabase();

  const existingUser = await findAdminUserByEmail(email);
  if (existingUser) {
    throw new Error(`Admin user already exists for ${email}.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createdUser = await createAdminUser({
    name,
    email,
    passwordHash,
    role,
    isActive: 1,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          role: createdUser.role,
          isActive: Boolean(createdUser.is_active),
        },
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
