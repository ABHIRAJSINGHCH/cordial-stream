ALTER TABLE public.user_integrations
  ALTER COLUMN secret_ciphertext TYPE text USING encode(secret_ciphertext, 'base64'),
  ALTER COLUMN secret_iv TYPE text USING encode(secret_iv, 'base64');
