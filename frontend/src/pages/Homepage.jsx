import BackgroundVideo from '../components/BackgroundVideo';
import LandingNavbar from '../components/LandingNavbar';
import HeroSection from '../components/HeroSection';

export default function Homepage() {
  return (
    <main className="relative bg-black h-screen w-screen flex flex-col overflow-hidden selection:bg-white selection:text-black shrink-0">
      <BackgroundVideo />
      <LandingNavbar />
      <HeroSection />
    </main>
  );
}
