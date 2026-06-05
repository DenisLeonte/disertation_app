import { StatusBar } from '../components/StatusBar';
import { LossChart } from '../components/LossChart';
import { TrainValChart } from '../components/TrainValChart';
import { PopulationTable } from '../components/PopulationTable';
import { DiversityChart } from '../components/DiversityChart';
import { ArchitectureViz } from '../components/ArchitectureViz';
import { MutationChart } from '../components/MutationChart';

export function Dashboard() {
  return (
    <div className="space-y-5">
      <StatusBar />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LossChart />
        <TrainValChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <ArchitectureViz />
        </div>
        <MutationChart />
      </div>

      <DiversityChart />
      <PopulationTable />
    </div>
  );
}
