import Footer from "../components/footer";
import Header from "../components/header";

export default function Account() {
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
				<h1>Account Page</h1>
			</div>
			<Footer></Footer>
		</>
	);
}
