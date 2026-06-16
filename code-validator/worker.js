export default {

    async fetch(request) {

        // CORS
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        };

        // Handle OPTIONS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // Only POST allowed
        if (request.method !== "POST") {

            return new Response(
                JSON.stringify({
                    valid:false,
                    message:"POST method required"
                }),
                {
                    status:405,
                    headers:{
                        "Content-Type":"application/json",
                        ...corsHeaders
                    }
                }
            );
        }

        try {

            const body = await request.json();
            const email = body.email;

            // Email format validation
            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if(!emailRegex.test(email)){

                return new Response(
                    JSON.stringify({
                        valid:false,
                        message:"Invalid email format"
                    }),
                    {
                        headers:{
                            "Content-Type":"application/json",
                            ...corsHeaders
                        }
                    }
                );
            }

            // Extract domain
            const parts = email.split("@");

            const localPart = parts[0].toLowerCase();
            const domain = parts[1].toLowerCase();


            // Suspicious words
            const blockedWords = [
                "fake",
                "test",
                "demo",
                "sample",
                "temp",
                "asdf",
                "qwerty",
                "abc123",
                "admin123",
                "invalid"
            ];


            // Check suspicious names
            for(const word of blockedWords){

                if(localPart.includes(word)){

                    return new Response(
                        JSON.stringify({
                            valid:false,
                            message:"Suspicious email name detected"
                        }),
                        {
                            headers:{
                                "Content-Type":"application/json",
                                ...corsHeaders
                            }
                        }
                    );
                }
            }

            // MX lookup
            const mxRecords = await resolveMX(domain);

            if(mxRecords && mxRecords.length > 0){

                return new Response(
                    JSON.stringify({
                        valid:true,
                        email:email,
                        mx:true
                    }),
                    {
                        headers:{
                            "Content-Type":"application/json",
                            ...corsHeaders
                        }
                    }
                );

            }else{

                return new Response(
                    JSON.stringify({
                        valid:false,
                        message:"No MX records found"
                    }),
                    {
                        headers:{
                            "Content-Type":"application/json",
                            ...corsHeaders
                        }
                    }
                );
            }

        } catch (error) {

            return new Response(
                JSON.stringify({
                    valid:false,
                    message:error.message
                }),
                {
                    headers:{
                        "Content-Type":"application/json",
                        ...corsHeaders
                    }
                }
            );
        }
    }
};

// MX lookup helper
async function resolveMX(domain){

    const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
        {
            headers:{
                "accept":"application/dns-json"
            }
        }
    );

    const data = await response.json();

    return data.Answer || [];
}