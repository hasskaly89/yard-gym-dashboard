-- Add block_type system columns to rig_blocks
ALTER TABLE rig_blocks
  ADD COLUMN IF NOT EXISTS block_type TEXT DEFAULT 'signature' CHECK (block_type IN ('signature', 'doublegain', 'sprint')),
  ADD COLUMN IF NOT EXISTS test_rm TEXT DEFAULT '3RM' CHECK (test_rm IN ('1RM', '3RM')),
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER DEFAULT 6;

-- Add phase and test_day columns to rig_block_weeks
ALTER TABLE rig_block_weeks
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'Base',
  ADD COLUMN IF NOT EXISTS is_test_day BOOLEAN DEFAULT false;

-- New table: which lifts are active per block
CREATE TABLE IF NOT EXISTS rig_block_lifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES rig_blocks(id) ON DELETE CASCADE,
  lift_id UUID REFERENCES rig_lifts(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(block_id, lift_id)
);

-- Update existing blocks to have default block_type
UPDATE rig_blocks SET
  block_type = 'signature',
  test_rm = '3RM',
  duration_weeks = 6
WHERE block_type IS NULL;
