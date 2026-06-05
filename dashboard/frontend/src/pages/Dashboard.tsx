import { StatusBar } from '../components/StatusBar';
import { LossChart } from '../components/LossChart';
import { TrainValChart } from '../components/TrainValChart';
import { PopulationTable } from '../components/PopulationTable';
import { DiversityChart } from '../components/DiversityChart';

export function Dashboard() {
  return (
    <div>
      <StatusBar />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <LossChart />
        <TrainValChart />
      </div>
      <div className="mb-6">
        <DiversityChart />
      </div>
      <PopulationTable />
    </div>
  );
}
