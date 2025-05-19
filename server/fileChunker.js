/**
 * File Chunking Service
 * Handles breaking files into chunks for efficient WebRTC transfer
 */

class FileChunker {
  constructor(options = {}) {
    // Default chunk size: 16KB (can be adjusted based on network conditions)
    this.chunkSize = options.chunkSize || 16 * 1024;
    this.maxParallelChunks = options.maxParallelChunks || 5;
  }

  /**
   * Split a file into chunks
   * @param {File|Blob} file - The file to be chunked
   * @returns {Array} - Array of chunks with metadata
   */
  chunkFile(file) {
    const chunks = [];
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(file.size, start + this.chunkSize);
      
      const chunk = file.slice(start, end);
      
      chunks.push({
        id: `${file.name}-chunk-${i}`,
        index: i,
        data: chunk,
        size: chunk.size,
        totalChunks: totalChunks,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        lastChunk: i === totalChunks - 1
      });
    }
    
    return chunks;
  }

  /**
   * Create a manifest of all chunks for a file
   * @param {File|Blob} file - The original file
   * @param {Array} chunks - The chunks created from the file
   * @returns {Object} - Manifest with file and chunk information
   */
  createManifest(file, chunks) {
    return {
      fileId: this.generateFileId(file),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: chunks.length,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        index: chunk.index,
        size: chunk.size
      })),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Generate a unique ID for a file
   * @param {File|Blob} file - The file to generate an ID for
   * @returns {String} - Unique file identifier
   */
  generateFileId(file) {
    // Simple implementation - in production use a more robust method
    return `${file.name}-${file.size}-${Date.now()}`;
  }
}

module.exports = FileChunker;
