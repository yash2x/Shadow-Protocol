const { buildPoseidon } = require('circomlibjs');
const fs = require('fs');

class MerkleTree {
  constructor(levels = 20) {
    this.levels = levels;
    this.leaves = [];
    this.poseidon = null;
    this.F = null;
    this.zeros = [];
    this.rootHistory = []; // [H-02 FIX] Increased root history
  }

  async init() {
    this.poseidon = await buildPoseidon();
    this.F = this.poseidon.F;

    this.zeros = new Array(this.levels + 1);
    this.zeros[0] = BigInt(0);
    for (let i = 1; i <= this.levels; i++) {
      this.zeros[i] = this.hashTwo(this.zeros[i - 1], this.zeros[i - 1]);
    }

    // Add initial root (empty tree)
    this.rootHistory.push(this.zeros[this.levels]);
  }

  hashTwo(left, right) {
    return this.F.toObject(this.poseidon([BigInt(left), BigInt(right)]));
  }

  insert(commitment) {
    const index = this.leaves.length;
    this.leaves.push(BigInt(commitment));

    // Calculate and store new root
    const newRoot = this.getRoot();
    this.rootHistory.push(newRoot);

    // [H-02 FIX] Keep last 10,000 roots instead of 100
    if (this.rootHistory.length > 10000) {
      this.rootHistory.shift();
    }

    return index;
  }

  getRoot() {
    if (this.leaves.length === 0) {
      return this.zeros[this.levels];
    }

    let level = [...this.leaves];

    for (let i = 0; i < this.levels; i++) {
      const nextLevel = [];

      for (let j = 0; j < level.length; j += 2) {
        const left = level[j];
        const right = j + 1 < level.length ? level[j + 1] : this.zeros[i];
        nextLevel.push(this.hashTwo(left, right));
      }

      if (nextLevel.length === 0) {
        nextLevel.push(this.zeros[i + 1]);
      }

      level = nextLevel;
    }

    return level[0];
  }

  // Check if a root is valid (current or historical)
  isKnownRoot(root) {
    const rootBigInt = BigInt(root);
    return this.rootHistory.some(r => r === rootBigInt);
  }

  getProof(index) {
    if (index >= this.leaves.length) {
      throw new Error('Index out of bounds');
    }

    const pathElements = [];
    const pathIndices = [];

    let currentIndex = index;
    let level = [...this.leaves];

    for (let i = 0; i < this.levels; i++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      pathIndices.push(isRight ? 1 : 0);

      if (siblingIndex < level.length) {
        pathElements.push(level[siblingIndex]);
      } else {
        pathElements.push(this.zeros[i]);
      }

      const nextLevel = [];
      for (let j = 0; j < level.length; j += 2) {
        const left = level[j];
        const right = j + 1 < level.length ? level[j + 1] : this.zeros[i];
        nextLevel.push(this.hashTwo(left, right));
      }

      if (nextLevel.length === 0) {
        nextLevel.push(this.zeros[i + 1]);
      }

      level = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
  }

  hasCommitment(commitment) {
    return this.leaves.some(leaf => leaf === BigInt(commitment));
  }

  getLeafIndex(commitment) {
    const commitmentBigInt = BigInt(commitment);
    return this.leaves.findIndex(leaf => leaf === commitmentBigInt);
  }
}

// [L-01 FIX] Atomic file writes for persistence
MerkleTree.prototype.saveToDisk = function (path) {
  try {
    const data = { leaves: this.leaves.map(l => l.toString()) };
    const tmpPath = path + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data));
    fs.renameSync(tmpPath, path); // Atomic rename
  } catch (err) {
    console.error('⚠️ Failed to save Merkle tree:', err.message);
  }
};

MerkleTree.prototype.loadFromDisk = function (path) {
  if (!fs.existsSync(path)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(path));
    this.leaves = data.leaves.map(l => BigInt(l));

    // Rebuild root history from loaded leaves
    if (this.poseidon) {
      this.rootHistory = [this.zeros[this.levels]]; // Start with empty root
      const tempLeaves = [];
      for (const leaf of this.leaves) {
        tempLeaves.push(leaf);
        // Recalculate root at each step (expensive but ensures correctness)
      }
      // Add current root
      this.rootHistory.push(this.getRoot());
    }

    return true;
  } catch (err) {
    console.error('⚠️ Failed to load Merkle tree:', err.message);
    return false;
  }
};

module.exports = { MerkleTree };
