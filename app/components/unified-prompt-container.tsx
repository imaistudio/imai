"use client";

import React, { useRef, useState, useEffect } from "react";
import { Badge, Button, cn, Form, Image, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuthState } from 'react-firebase-hooks/auth';
import { storage, auth } from '@/lib/firebase';

import {
	ProductType,
	ProductImages,
	defaultProductImages,
	productSpecificDesigns,
	defaultDesignImages,
	defaultColorImages,
	defaultPlaceholders,
	designPlaceholders,
	colorPlaceholders,
	productLabels,
	designLabels,
	colorLabels,
} from "@/constants/inputs";

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	lang: string;
	interimResults: boolean;
	maxAlternatives: number;
	start(): void;
	stop(): void;
	onresult: (event: SpeechRecognitionEvent) => void;
	onerror: (event: SpeechRecognitionErrorEvent) => void;
	onend: () => void;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognition;
}

declare global {
	interface Window {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	}
}

export interface ImageAsset {
	type: "product" | "design" | "color";
	path: string;
	productType?: string;
	designCategory?: string;
	colorIndex?: number;
}

type DrawerType = "product" | "design" | "color";

interface SubmissionData {
	prompt: string;
	product: string;
	design: string[];
	color: string[];
}

interface UnifiedPromptContainerProps {
	onSubmit?: (data: SubmissionData) => void;
	placeholder?: string;
	maxLength?: number;
}

export default function UnifiedPromptContainer({
	onSubmit,
	placeholder = "Reimagine ArtWork",
	maxLength = 1000,
}: UnifiedPromptContainerProps) {
	const [prompt, setPrompt] = useState("");
	const [images, setImages] = useState<ImageAsset[]>([]);
	const [drawerType, setDrawerType] = useState<DrawerType | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [selectedProductType, setSelectedProductType] =
		useState<ProductType | null>(null);
	const [uploadingImages, setUploadingImages] = useState<Set<DrawerType>>(new Set());
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [user, loading, error] = useAuthState(auth);

	// Voice state
	const [isRecording, setIsRecording] = useState(false);
	const [recognition, setRecognition] = useState<SpeechRecognition | null>(
		null
	);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationIdRef = useRef<number | null>(null);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const SpeechRecognitionConstructor =
				window.webkitSpeechRecognition || window.SpeechRecognition;

			if (SpeechRecognitionConstructor) {
				const recog: SpeechRecognition = new SpeechRecognitionConstructor();
				recog.continuous = false;
				recog.lang = "en-US";
				recog.interimResults = false;
				recog.maxAlternatives = 1;

				recog.onresult = (event: SpeechRecognitionEvent) => {
					const speechResult = event.results[0][0].transcript;
					setPrompt((prev) => prev + (prev ? " " : "") + speechResult);
				};

				recog.onerror = (event: SpeechRecognitionErrorEvent) => {
					console.error("Speech recognition error", event.error);
				};

				recog.onend = () => {
					setIsRecording(false);
					if (animationIdRef.current) {
						cancelAnimationFrame(animationIdRef.current);
						animationIdRef.current = null;
					}
				};

				setRecognition(recog);
			}
		}
	}, []);

	const startWaveform = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let x = 0;
		const draw = () => {
			const width = canvas.width;
			const height = canvas.height;
			ctx.clearRect(0, 0, width, height);

			ctx.beginPath();
			const amplitude = 5 + Math.random() * 15;
			const frequency = 0.05;
			ctx.moveTo(0, height / 2);
			for (let i = 0; i < width; i++) {
				const y = height / 2 + Math.sin(i * frequency + x) * amplitude;
				ctx.lineTo(i, y);
			}
			ctx.strokeStyle = "#3b82f6"; // Tailwind blue-500
			ctx.lineWidth = 2;
			ctx.stroke();

			x += 0.05;
			animationIdRef.current = requestAnimationFrame(draw);
		};

		draw();
	};

	const toggleVoiceInput = () => {
		if (!recognition) return;
		if (isRecording) {
			recognition.stop();
			if (animationIdRef.current) {
				cancelAnimationFrame(animationIdRef.current);
				animationIdRef.current = null;
			}
			setIsRecording(false);
		} else {
			setPrompt("");
			recognition.start();
			startWaveform();
			setIsRecording(true);
		}
	};

	useEffect(() => {
		const productImage = images.find((img) => img.type === "product");
		if (productImage?.productType && productImage.productType !== "custom") {
			setSelectedProductType(productImage.productType as ProductType);
		} else if (!productImage) {
			setSelectedProductType(null);
		}
	}, [images]);

	// Helper function to extract filename from path
	const extractFilename = (path: string): string => {
		if (path.startsWith('data:')) {
			// For uploaded files (data URLs), return a generic filename
			return 'uploaded-image';
		}
		if (path.includes('firebasestorage.googleapis.com')) {
			// For Firebase Storage URLs, extract filename from the path
			const urlParts = path.split('/');
			const encodedPath = urlParts[urlParts.length - 1];
			const decodedPath = decodeURIComponent(encodedPath.split('?')[0]);
			const pathParts = decodedPath.split('/');
			return pathParts[pathParts.length - 1];
		}
		// Extract filename from path
		const parts = path.split('/');
		return parts[parts.length - 1];
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		
		// Separate images by type
		const productImage = images.find(img => img.type === "product");
		const designImages = images.filter(img => img.type === "design");
		const colorImages = images.filter(img => img.type === "color");

		const submissionData: SubmissionData = {
			prompt: prompt.trim(),
			product: productImage?.productType === "custom" 
				? productImage.path // Return the actual Firebase URL for uploaded images
				: productImage?.productType || "",
			design: designImages.map(img => 
				img.path.includes('firebasestorage.googleapis.com') 
					? img.path // Return Firebase URL for uploaded images
					: extractFilename(img.path) // Return filename for preset images
			),
			color: colorImages.map(img => 
				img.path.includes('firebasestorage.googleapis.com') 
					? img.path // Return Firebase URL for uploaded images
					: extractFilename(img.path) // Return filename for preset images
			)
		};
		
		if (onSubmit) onSubmit(submissionData);
	};

	const handleUpload = async (
		type: DrawerType,
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Check if user is authenticated
		if (!user) {
			console.error('User must be authenticated to upload images');
			// You might want to show a toast notification or redirect to login
			return;
		}

		setUploadingImages(prev => new Set(Array.from(prev).concat(type)));

		try {
			// Create a unique filename
			const timestamp = Date.now();
			const fileExtension = file.name.split('.').pop();
			const fileName = `${type}_${timestamp}.${fileExtension}`;
			
			// Create storage reference: userid/inputs/filename
			const storageRef = ref(storage, `${user.uid}/inputs/${fileName}`);
			
			// Upload file
			const snapshot = await uploadBytes(storageRef, file);
			
			// Get download URL
			const downloadURL = await getDownloadURL(snapshot.ref);
			
			// Create new image asset with Firebase URL
			const newImage: ImageAsset = {
				type,
				path: downloadURL,
				...(type === "product" && { productType: "custom" }),
			};
			
			setImages((prev) => [
				...prev.filter((img) => img.type !== type),
				newImage,
			]);
			
			setDrawerOpen(false);
		} catch (error) {
			console.error('Error uploading image:', error);
			// You might want to show an error notification to the user
		} finally {
			setUploadingImages(prev => {
				const newSet = new Set(Array.from(prev));
				newSet.delete(type);
				return newSet;
			});
		}
	};

	const selectRandomFromLabel = (
		label: string,
		urls: string[],
		type: DrawerType
	) => {
		const randomPath = urls[Math.floor(Math.random() * urls.length)];
		const newImage: ImageAsset = {
			type,
			path: randomPath,
			...(type === "product" && { productType: label }),
			...(type === "design" && {
				designCategory: label,
				productType: selectedProductType || undefined,
			}),
			...(type === "color" && {
				colorIndex: images.filter(img => img.type === "color").length
			}),
		};
		
		if (type === "color") {
			// Keep only the two most recent color selections
			const colorImages = images.filter(img => img.type === "color");
			if (colorImages.length >= 2) {
				setImages(prev => [
					...prev.filter(img => img.type !== "color"),
					newImage
				]);
			} else {
				setImages(prev => [...prev, newImage]);
			}
		} else {
			setImages(prev => [...prev.filter(img => img.type !== type), newImage]);
		}
		setDrawerOpen(false);
	};

	const getDesignCategories = (): ProductImages => {
		if (selectedProductType && productSpecificDesigns[selectedProductType]) {
			return productSpecificDesigns[selectedProductType];
		}
		return defaultDesignImages;
	};

	const getPlaceholder = (image: ImageAsset): string => {
		if (
			image.type === "product" &&
			image.productType &&
			image.productType !== "custom"
		) {
			return (
				defaultPlaceholders[image.productType as ProductType] || image.path
			);
		}
		if (image.type === "design" && image.designCategory) {
			return designPlaceholders[image.designCategory] || image.path;
		}
		if (image.type === "color") {
			const label = Object.keys(colorPlaceholders).find((key) =>
				image.path.includes(key)
			);
			return label ? colorPlaceholders[label] : image.path;
		}
		return image.path;
	};

	const renderDrawer = () => {
		if (!drawerOpen || !drawerType) return null;

		let presetMap: ProductImages;
		if (drawerType === "product") {
			presetMap = defaultProductImages;
		} else if (drawerType === "design") {
			presetMap = getDesignCategories();
		} else {
			presetMap = defaultColorImages;
		}

		const presetKeys = Object.keys(presetMap);
		const first = presetKeys[0];
		const reordered = [first, "UPLOAD_MARKER", ...presetKeys.slice(1)];

		return (
			<div className="w-full bg-default-100 rounded-t-lg shadow-sm pl-4 py-2 pr-4 z-10 mb-4">
				<div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
					<div className="grid grid-rows-2 auto-cols-max gap-4 grid-flow-col min-w-max">
						{reordered.map((label, index) => {
							if (label === "UPLOAD_MARKER") {
								const isUploading = uploadingImages.has(drawerType);
								return (
									<div key={`upload-${drawerType}`} className="flex flex-col items-center">
										<label className={`w-24 h-24 flex items-center justify-center bg-[#fafafa] dark:bg-[#18181b] border rounded-lg text-xs ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary'}`}>
											{isUploading ? (
												<Icon icon="lucide:loader-2" width={18} className="animate-spin" />
											) : (
												<Icon icon="lucide:upload" width={18} />
											)}
											<input
												type="file"
												accept="image/*"
												onChange={(e) => handleUpload(drawerType, e)}
												className="hidden"
												disabled={isUploading}
											/>
										</label>
										<span className="mt-1 text-xs text-center capitalize">
											{isUploading ? 'Uploading...' : `Upload ${drawerType}`}
										</span>
									</div>
								);
							}

							const urls = presetMap[label];
							const imageSrc =
								drawerType === "product"
									? (defaultPlaceholders as Record<string, string>)[label]
									: drawerType === "design"
										? (designPlaceholders as Record<string, string>)[label]
										: (colorPlaceholders as Record<string, string>)[label];

							// Get custom label or fallback to original label
							const customLabel = 
								drawerType === "product"
									? productLabels[label as ProductType] || label
									: drawerType === "design"
										? designLabels[label] || label
										: colorLabels[label] || label;

							return (
								<div key={`${drawerType}-${label}-${index}`} className="flex flex-col items-center">
									<button
										onClick={() =>
											selectRandomFromLabel(label, urls, drawerType)
										}
										className="w-24 h-24 flex items-center justify-center"
									>
										<img
											src={imageSrc}
											className="w-full h-full object-cover rounded-md text-white bg-[#fafafa] dark:bg-transparent"
										/>
									</button>
									<span 
										className="mt-1 text-xs text-center"
										dangerouslySetInnerHTML={{ __html: customLabel }}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		);
	};

	const renderImageAssets = () => (
		<div className="group flex gap-2 pl-[20px] pt-4 pr-3 pb-2">
			{images.map((image, index) => (
				<Badge
					key={`${image.type}-${index}`}
					isOneChar
					className="opacity-100"
					content={
						<Button
							isIconOnly
							radius="full"
							size="sm"
							variant="light"
							onPress={() =>
								setImages((prev) =>
									prev.filter((img) => 
										img.type !== image.type || 
										(img.type === "color" && img.colorIndex !== image.colorIndex)
									)
								)
							}
						>
							<Icon icon="lucide:x" width={16} />
						</Button>
					}
				>
					<div className="relative">
						<Image
							alt={`${image.type} image`}
							className="h-14 w-14 rounded-small border-small border-default-200/50 object-cover"
							src={getPlaceholder(image)}
						/>
						{image.type === "color" && image.colorIndex !== undefined && (
							<div className="absolute -top-2 -right-2  text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
								{image.colorIndex + 1}
							</div>
						)}
					</div>
				</Badge>
			))}
		</div>
	);

	const buttonTypes: readonly DrawerType[] = [
		"product",
		"design",
		"color",
	] as const;

	// Cleanup animation frame on unmount
	useEffect(() => {
		return () => {
			if (animationIdRef.current) {
				cancelAnimationFrame(animationIdRef.current);
			}
		};
	}, []);

	return (
		<div className="flex h-auto w-full relative">
			<div className="flex h-full w-full items-center justify-center">
				<div className="relative w-full max-w-4xl flex flex-col items-center gap-8">
					<Form
						onSubmit={handleSubmit}
						className="flex w-full flex-col gap-0 rounded-medium bg-default-100 overflow-hidden"
					>
						{renderDrawer()}
						{renderImageAssets()}

					{!drawerOpen && (
						<textarea
							ref={inputRef}
							className="min-h-[40px] text-medium h-auto w-full py-0 !bg-transparent shadow-none pr-3 pl-[20px] pt-3 pb-4 outline-none resize-none"
							maxLength={maxLength}
							name="content"
							placeholder={placeholder}
							rows={1}
							spellCheck={false}
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									if (prompt.trim() || images.length > 0) {
										const form = e.currentTarget.closest('form');
										if (form) {
											form.requestSubmit();
										}
									}
								}
							}}
						/>
					)}

						{isRecording && (
							<canvas
								ref={canvasRef}
								width={300}
								height={30}
								className="w-full mb-2"
							/>
						)}

						<div className="flex w-full items-center justify-between px-3 pb-3">
							<div className="flex space-x-2">
								{buttonTypes.map((type) => {
									const isActive = images.some((img) => img.type === type);
									const iconName =
										type === "product"
											? "lucide:package"
											: type === "design"
												? "lucide:palette"
												: "lucide:droplets";

									return (
										<Tooltip key={type} content={`Select ${type}`}>
											<Button
												isIconOnly
												radius="full"
												size="sm"
												variant="light"
												onPress={() => {
													if (drawerType === type && drawerOpen) {
														setDrawerOpen(false);
													} else {
														setDrawerType(type);
														setDrawerOpen(true);
													}
												}}
												className={
													isActive
														? "bg-primary text-white dark:text-white"
														: "text-black dark:text-white"
												}
											>
												<Icon icon={iconName} width={20} />
											</Button>
										</Tooltip>
									);
								})}
							</div>
							<div className="flex items-center space-x-2">
								<Button
									isIconOnly
									radius="full"
									size="sm"
									variant="light"
									onPress={toggleVoiceInput}
									className={
										isRecording ? "bg-primary animate-pulse text-white" : ""
									}
								>
									<Icon icon="lucide:mic" width={20} />
								</Button>
								<Button
									isIconOnly
									color={!prompt && images.length === 0 ? "default" : "primary"}
									isDisabled={!prompt && images.length === 0}
									radius="full"
									size="sm"
									type="submit"
									variant="solid"
								>
									<Icon
										className={cn(
											"[&>path]:stroke-[2px]",
											!prompt && images.length === 0
												? "text-default-600"
												: "text-primary-foreground"
										)}
										icon="lucide:arrow-up"
										width={20}
									/>
								</Button>
							</div>
						</div>
					</Form>
				</div>
			</div>
		</div>
	);
}
