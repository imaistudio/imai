import Footer from "../components/footer";
import Header from "../components/header";
import MobileNavRest from "@/app/components/MobileNavRest";
export default function Setting() {
  return (
    <>
      <Header></Header>
      <MobileNavRest />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1>Setting Page</h1>
      </div>
      <Footer></Footer>
    </>
  );
}
