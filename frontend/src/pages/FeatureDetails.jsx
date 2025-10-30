import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import features from '../data/features'
import Footer from '../components/Footer'

const FeatureDetails = () => {
	const { slug } = useParams()
	const feature = features.find((f) => f.slug === slug)

	if (!feature) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-dark-900 text-white">
				<div className="text-center p-6">
					<h2 className="text-3xl font-bold mb-4">Feature not found</h2>
					<p className="text-gray-300 mb-6">We're sorry, but the feature you're looking for doesn't exist.</p>
					<Link to="/" className="btn-neon px-6 py-3">Go back home</Link>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-dark-900 text-white">
			<div className="max-w-5xl mx-auto py-16 px-4">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6 }}
					whileHover={{ scale: 1.02 }}
					className="card-glow p-8"
				>
					{/* Header with icon and title */}
					<div className="flex items-center gap-6 mb-8">
						<div className="text-6xl">{feature.icon}</div>
						<div>
							<h1 className="text-4xl font-bold text-neon-cyan">{feature.title}</h1>
							<p className="text-gray-400 mt-2">{feature.slug}</p>
						</div>
					</div>

					{/* Main content grid */}
					<div className="grid md:grid-cols-3 gap-8 items-start">
						<div className="md:col-span-1">
							<img src={feature.image} alt={feature.title} className="w-full rounded-lg shadow-lg" />
						</div>

						<div className="md:col-span-2">
							<h2 className="text-2xl font-semibold mb-4 text-white">Overview</h2>

							{feature.longDescription ? (
								feature.longDescription.split('\n\n').map((para, idx) => (
									<p key={idx} className="text-gray-300 mb-4 leading-relaxed">{para}</p>
								))
							) : (
								<p className="text-gray-300 mb-6">{feature.description}</p>
							)}

							{/* Action buttons */}
							<div className="mt-8 flex flex-wrap gap-4">
								<Link to="/" className="btn-neon px-6 py-3">Back to features</Link>
								<Link to="/dashboard" className="btn-neon-purple px-6 py-3">Open Dashboard</Link>
							</div>
						</div>
					</div>
				</motion.div>
			</div>
			<Footer />
		</div>
	)
}

export default FeatureDetails
