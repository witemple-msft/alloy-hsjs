import "@typespec/http";

@service(#{ title: "My Service" })
namespace MyService;

using TypeSpec.Http;

/**
 * Information about the service.
 */
model Info {
    /**
     * The message of the day.
     */
    motd: string;
}

@route("/hello")
interface Operations {
    @get info(): OkResponse & Info;
}
