'use client';

import { useEffect, useState } from 'react';

const SolanaCoin3D = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: isMobile ? '85vw' : '38vw',
        height: isMobile ? '100vw' : '45vw',
        marginTop: isMobile ? '0' : '-1.5vw',
      }}
    >
      <img
        src="/hero.png"
        alt="Shadow Protocol"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
        }}
      />
    </div>
  );
};

export default SolanaCoin3D;
