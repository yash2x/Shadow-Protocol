const { buildPoseidon } = require('circomlibjs');

class MerkleTree {
  constructor(levels = 20) {
    this.levels = levels;
    this.leaves = [];
    this.poseidon = null;
    this.F = null;
    this.zeros = [];
    this.rootHistory = []; // Garder l'historique des racines
  }

  async init() {
    this.poseidon = await buildPoseidon();
    this.F = this.poseidon.F;
    
    this.zeros = new Array(this.levels + 1);
    this.zeros[0] = BigInt(0);
    for (let i = 1; i <= this.levels; i++) {
      this.zeros[i] = this.hashTwo(this.zeros[i-1], this.zeros[i-1]);
    }
    
    // Ajouter la racine initiale (arbre vide)
    this.rootHistory.push(this.zeros[this.levels]);
  }

  hashTwo(left, right) {
    return this.F.toObject(this.poseidon([BigInt(left), BigInt(right)]));
  }

  insert(commitment) {
    const index = this.leaves.length;
    this.leaves.push(BigInt(commitment));
    
    // Calculer et sauvegarder la nouvelle racine
    const newRoot = this.getRoot();
    this.rootHistory.push(newRoot);
    
    // Garder les 100 dernières racines
    if (this.rootHistory.length > 100) {
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

  // Vérifier si une racine est valide (actuelle ou historique)
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

module.exports = { MerkleTree };
