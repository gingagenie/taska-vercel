import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          </div>
          <p className="text-gray-600">Last updated: September 17, 2025</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Taska Field Service Management Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-6 text-gray-700">
                
                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Account Information</h3>
                      <p>When you create a Taska account, we collect your email address, organization name, and password. This information is necessary to provide you with access to our field service management platform.</p>
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Business Data</h3>
                      <p>We collect and store the business information you enter into Taska, including:</p>
                      <ul className="list-disc ml-6 mt-2 space-y-1">
                        <li>Customer contact information and addresses</li>
                        <li>Job details, schedules, and notes</li>
                        <li>Equipment information and service history</li>
                        <li>Quotes, invoices, and financial records</li>
                        <li>Team member information and assignments</li>
                        <li>Support ticket communications</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Usage Information</h3>
                      <p>We automatically collect information about how you use Taska, including page views, feature usage, API calls, and system performance data to improve our service and provide technical support.</p>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">SMS and Communication Data</h3>
                      <p>When you use our SMS notification features, we store message content, delivery status, and customer responses to provide automated job confirmation services.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
                  <p>We use your information to:</p>
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Provide and maintain the Taska platform and its features</li>
                    <li>Process your business data and enable field service management</li>
                    <li>Send SMS notifications and automated confirmations to your customers</li>
                    <li>Integrate with third-party services like Xero accounting software</li>
                    <li>Provide customer support and respond to your inquiries</li>
                    <li>Monitor usage and enforce subscription limits</li>
                    <li>Improve our services and develop new features</li>
                    <li>Ensure platform security and prevent unauthorized access</li>
                    <li>Comply with legal obligations and resolve disputes</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Data Sharing and Disclosure</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Service Providers</h3>
                      <p>We share your information with trusted third-party service providers who help us operate Taska:</p>
                      <ul className="list-disc ml-6 mt-2 space-y-1">
                        <li><strong>Database Hosting:</strong> Neon Database for secure data storage</li>
                        <li><strong>SMS Services:</strong> Twilio for customer notifications</li>
                        <li><strong>Email Services:</strong> SendGrid for system emails</li>
                        <li><strong>Payment Processing:</strong> Stripe for subscription billing</li>
                        <li><strong>Accounting Integration:</strong> Xero for financial data synchronization</li>
                        <li><strong>Analytics:</strong> TikTok Events API for advertising and conversion tracking</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Business Transfers</h3>
                      <p>If Taska is acquired or merged with another company, your information may be transferred as part of that transaction. We will notify you of any such change.</p>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Legal Requirements</h3>
                      <p>We may disclose your information if required by law, court order, or to protect our rights, property, or safety, or that of our users or the public.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Security and Retention</h2>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Security Measures</h3>
                      <p>We implement enterprise-grade security measures including:</p>
                      <ul className="list-disc ml-6 mt-2 space-y-1">
                        <li>Encryption of data in transit and at rest</li>
                        <li>Secure session-based authentication with bcrypt password hashing</li>
                        <li>Multi-tenant data isolation between organizations</li>
                        <li>Regular security audits and monitoring</li>
                        <li>Secure API endpoints with proper authorization</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-800 mb-2">Data Retention</h3>
                      <p>We retain your data for as long as your account is active or as needed to provide services. After account deletion, we may retain some information for legal compliance, fraud prevention, or legitimate business purposes for up to 7 years.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Your Rights and Choices</h2>
                  <div className="space-y-3">
                    <p>You have the following rights regarding your personal information:</p>
                    <ul className="list-disc ml-6 mt-2 space-y-1">
                      <li><strong>Access:</strong> Request a copy of your personal data</li>
                      <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                      <li><strong>Deletion:</strong> Request deletion of your personal data</li>
                      <li><strong>Data Portability:</strong> Export your data in a machine-readable format</li>
                      <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
                    </ul>
                    
                    <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@taska.info" className="text-blue-600 hover:underline">privacy@taska.info</a> or through our support system.</p>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">6. International Data Transfers</h2>
                  <p>Taska operates globally and may transfer your data to countries outside your residence. We ensure adequate protection through appropriate safeguards, including data processing agreements and adherence to applicable data protection frameworks.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h2>
                  <p>We use essential cookies for authentication and session management. Our analytics implementation through TikTok Events API helps us understand user behavior and improve our advertising effectiveness. You can manage cookie preferences through your browser settings.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Mobile Applications</h2>
                  <p>Our mobile applications (iOS and Android) collect the same information as our web platform. Mobile-specific permissions may include camera access for photo uploads and location services for job tracking, which you can control through your device settings.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children's Privacy</h2>
                  <p>Taska is designed for business use and is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected such information, we will delete it promptly.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Changes to This Policy</h2>
                  <p>We may update this privacy policy periodically to reflect changes in our practices or applicable laws. We will notify you of significant changes by email or through our platform. Your continued use of Taska after such notification constitutes acceptance of the updated policy.</p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Contact Information</h2>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="font-medium text-gray-900 mb-2">For privacy-related questions or concerns, contact us:</p>
                    <ul className="space-y-1">
                      <li>Email: <a href="mailto:privacy@taska.info" className="text-blue-600 hover:underline">privacy@taska.info</a></li>
                      <li>Support: Through our in-app support system</li>
                      <li>Website: <a href="https://taska.info" className="text-blue-600 hover:underline">https://taska.info</a></li>
                    </ul>
                    
                    <p className="mt-3 text-sm text-gray-600">
                      Taska Field Service Management<br />
                      Data Protection Officer<br />
                      Response time: Within 30 days of receipt
                    </p>
                  </div>
                </section>

                <div className="border-t pt-6 mt-8">
                  <p className="text-sm text-gray-500 text-center">
                    This privacy policy is effective as of September 17, 2025, and governs your use of Taska's field service management platform.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}