'use client';

export default function AnimatedBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden font-mono text-[#a1a39b]">
            {/* Absolute Grid Lines */}
            {/* Vertical center divider */}
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[#c3c5bc]" />
            {/* Horizontal divider below hero */}
            <div className="absolute top-[65%] left-0 right-0 h-[1px] bg-[#c3c5bc]" />

            {/* Floating HUD code snippet top right */}
            <div className="absolute top-[10%] right-[10%] text-[10px] leading-relaxed hidden lg:block opacity-60">
                <p>const synapseLink =</p>
                <p className="ml-4">await NeuroWallet.connect("zk-id:0x94F2...D37e");</p>
                <br />
                <p>if (synapseLink.status === 'neuro-active') {'{'}</p>
                <p className="ml-4">const thoughtHash =</p>
                <p className="ml-4">await aiAgent.captureIntent(userContext);</p>
                <p className="ml-4">zkMint(thoughtHash,</p>
                <p className="ml-8">{'{'} privacyLevel: 'obfuscated_anonymous' {'}'});</p>
                <p>{'}'}</p>
            </div>

            {/* Abstract horizontal capsule shapes (right side) */}
            <div className="absolute top-[40%] right-[15%] w-[300px] h-[60px] bg-[#d3d5cc]/40 rounded-full blur-[2px] hidden lg:block" />
            <div className="absolute top-[50%] right-[5%] w-[200px] h-[60px] bg-[#d3d5cc]/40 rounded-full blur-[2px] hidden lg:block" />

            {/* Crosshairs & Registration Marks */}
            {/* Center crosshair */}
            <div className="absolute top-[65%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                <div className="absolute w-[20px] h-[1px] bg-[#a1a39b]" />
                <div className="absolute w-[1px] h-[20px] bg-[#a1a39b]" />
            </div>

            {/* Crosshair top right of title box (approximate) */}
            <div className="absolute top-[68%] left-[55%] flex items-center justify-center opacity-70">
                <div className="absolute w-[14px] h-[2px] bg-[#888]" />
                <div className="absolute w-[2px] h-[14px] bg-[#888]" />
            </div>

            {/* "+++ " text overlays */}
            <div className="absolute top-[55%] right-[38%] text-[12px] font-bold tracking-[0.2em] opacity-50 hidden lg:block">
                +++
            </div>

            {/* Small UI rectangular blocks */}
            <div className="absolute top-[68%] left-[60%] flex gap-2">
                <div className="w-8 h-[3px] bg-[#c3c5bc] rounded-full" />
                <div className="w-12 h-[3px] bg-[#c3c5bc] rounded-full" />
            </div>
        </div>
    );
}
