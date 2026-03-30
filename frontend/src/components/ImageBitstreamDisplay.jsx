/**
 * ImageBitstreamDisplay.jsx
 * Displays encrypted image bitstream from ESP32-CAM
 * Shows 64 or 128 bits as hex with visual bit representation
 */
import { memo } from 'react';

const ImageBitstreamDisplay = memo(function ImageBitstreamDisplay({ 
  imageEncrypted, 
  imageIv, 
  imageHash,
  bits = 128 
}) {
  if (!imageEncrypted) {
    return (
      <div className="text-sm text-gray-500 italic">
        No image bitstream available
      </div>
    );
  }

  const bitCount = imageEncrypted.length * 4; // 4 bits per hex char

  return (
    <div className="space-y-3">
      {/* Encrypted bitstream */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1">
          Encrypted Bitstream ({bitCount} bits)
        </div>
        <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200 break-all">
          {imageEncrypted}
        </div>
      </div>

      {/* IV */}
      {imageIv && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">
            Initialization Vector
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200 break-all">
            {imageIv}
          </div>
        </div>
      )}

      {/* Hash */}
      {imageHash && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">
            Original Hash (SHA-256)
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200 break-all">
            {imageHash}
          </div>
        </div>
      )}

      {/* Visual bit representation */}
      <div className="pt-2">
        <div className="text-xs font-semibold text-gray-600 mb-2">
          Bit Visualization
        </div>
        <div className="grid grid-cols-16 gap-0.5">
          {imageEncrypted.split('').map((hexChar, idx) => {
            const value = parseInt(hexChar, 16);
            const bits = value.toString(2).padStart(4, '0').split('');
            
            return (
              <div key={idx} className="flex flex-col items-center">
                <div className="text-xs font-mono mb-0.5 text-gray-700">
                  {hexChar}
                </div>
                <div className="flex gap-px">
                  {bits.map((bit, bitIdx) => (
                    <div
                      key={bitIdx}
                      className={`w-1.5 h-3 ${
                        bit === '1' 
                          ? 'bg-blue-500' 
                          : 'bg-gray-200'
                      }`}
                      title={`Bit ${idx * 4 + bitIdx}: ${bit}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t">
        <div>
          <span className="font-semibold">Encrypted:</span> {imageEncrypted.length} chars
        </div>
        <div>
          <span className="font-semibold">IV:</span> {imageIv ? imageIv.length : 0} chars
        </div>
        <div>
          <span className="font-semibold">Hash:</span> {imageHash ? imageHash.length : 0} chars
        </div>
      </div>
    </div>
  );
});

export default ImageBitstreamDisplay;
