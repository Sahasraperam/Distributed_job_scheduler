import * as bcrypt from 'bcrypt';

describe('Auth Service Password Cryptography', () => {
  const passwordRaw = 'password123';
  let hashedPassword = '';

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(passwordRaw, 10);
  });

  it('should correctly hash raw passwords', () => {
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(passwordRaw);
    expect(hashedPassword.startsWith('$2b$')).toBe(true);
  });

  it('should successfully match correct password inputs', async () => {
    const matches = await bcrypt.compare(passwordRaw, hashedPassword);
    expect(matches).toBe(true);
  });

  it('should fail validation checks on incorrect password inputs', async () => {
    const matches = await bcrypt.compare('wrongpassword', hashedPassword);
    expect(matches).toBe(false);
  });
});
