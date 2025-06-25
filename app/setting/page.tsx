import Footer from "../components/footer";
import Header from "../components/header";
export default function Setting() {
  return (
    <>
      <Header></Header>
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
