const bcrypt = require("bcryptjs");
const { initializeDatabase, upsertAdminUser } = require("../src/db");

const main = async () => {
  const name = String(process.env.ADMIN_SEED_NAME || "").trim();
  const email = String(process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_SEED_PASSWORD || "");

  if (!name || !email || !password) {
    throw new Error("ADMIN_SEED_NAME, ADMIN_SEED_EMAIL, and ADMIN_SEED_PASSWORD are required.");
  }

  await initializeDatabase();

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await upsertAdminUser({
    name,
    email,
    passwordHash,
    role: "admin",
    isActive: 1,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: Boolean(user.is_active),
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
