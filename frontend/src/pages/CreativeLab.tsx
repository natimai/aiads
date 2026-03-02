import { Palette } from "lucide-react";

export default function CreativeLab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Creative Lab</h2>
        <p className="text-sm text-slate-500">Analyze creative performance and identify fatigue patterns</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-20">
        <Palette className="mb-4 h-12 w-12 text-slate-600" />
        <p className="text-sm text-slate-400">Creative performance analysis</p>
        <p className="text-xs text-slate-500">Charts and creative matrix will appear here when data is available</p>
      </div>
    </div>
  );
}
