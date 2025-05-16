import Footer from "../components/footer";
import Header from "../components/header";
export default function Signup() {
  return (
    <>
    <Header className="pt-6 pb-6 bg-black text-white"></Header>
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <h1>Signup Page</h1>
    </div>
    <Footer></Footer>
    </>
  );
}