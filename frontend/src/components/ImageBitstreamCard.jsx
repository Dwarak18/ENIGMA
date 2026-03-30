/**
 * ImageBitstreamCard.jsx
 * Card component displaying encrypted image bitstream with stats
 */
import { memo } from 'react';
import ImageBitstreamDisplay from './ImageBitstreamDisplay.jsx';

const ImageBitstreamCard = memo(function ImageBitstreamCard({ record }) {
  if (!record?.image_encrypted) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg 
            className="w-4 h-4 text-purple-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
          Image Bitstream (AES-256 Encrypted)
        </h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
            {record.image_encrypted?.length * 4} bits
          </span>
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
            Verified
          </span>
        </div>
      </div>

      {/* Content */}
      <ImageBitstreamDisplay
        imageEncrypted={record.image_encrypted}
        imageIv={record.image_iv}
        imageHash={record.image_hash}
      />

      {/* Decryption info */}
      <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
        <p className="text-xs text-blue-800">
          <strong>🔐 Decryption:</strong> Use entropy_hash as AES-256 key + image_iv to decrypt. 
          Hash verifies integrity of original bitstream.
        </p>
      </div>
    </div>
  );
});

export default ImageBitstreamCard;
