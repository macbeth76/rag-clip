import natural from 'natural';

const { TfIdf } = natural;

class BM25 {
  constructor() {
    this.tfidf = new TfIdf();
    this.docs = [];
  }

  addDocument(doc, id) {
    this.tfidf.addDocument(doc);
    this.docs.push({ id, content: doc });
  }

  search(query, limit = 5) {
    const results = [];
    
    this.tfidf.tfidfs(query, (i, score) => {
      if (score > 0) {
        results.push({ id: this.docs[i].id, score });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export default BM25;
