import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Loading CharliesOdds</h2>
        <p className="text-gray-400 mb-6">Setting up your gaming environment...</p>

            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;